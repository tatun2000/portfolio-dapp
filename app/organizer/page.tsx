"use client";

import { useAccount, useWriteContract } from "wagmi";
import { useState, useEffect } from "react";
import { PORTFOLIO_ABI, PORTFOLIO_ADDRESS } from "../lib/contract";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { keccak256, toBytes } from "viem";

const GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs/";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

type EventRec = {
  id: bigint;
  owner: `0x${string}`;
  organizer: `0x${string}`;
  startAt: bigint;
  endAt: bigint;
  contentHash: `0x${string}`;
  contentURI: string;
  resultURI: string;
  status: number; // 0=Pending, 1=Confirmed, 2=Rejected
};

function isIpfsUri(u: string): boolean {
  return !!u && u.startsWith("ipfs://");
}

function uriToGateway(url: string): string {
  // ipfs://<cid>/path -> https://.../ipfs/<cid>/path
  const rest = url.replace(/^ipfs:\/\//, "");
  const [cid, ...path] = rest.split("/");
  return `${GATEWAY}${cid}${path.length ? `/${path.join("/")}` : ""}`;
}

async function fetchIpfsText(ipfsUri: string): Promise<string> {
  const gw = uriToGateway(ipfsUri);
  const res = await fetch(gw, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gateway ${res.status}: ${text.slice(0, 200)}`);
  }
  // Take raw text, not JSON (hash must match the exact original string)
  return await res.text();
}

function eqHex32(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// Main check: valid ipfs:// + keccak256(content) matches on-chain hash
async function validateContentURI(
  ev: EventRec
): Promise<{ ok: boolean; reason?: string }> {
  if (!isIpfsUri(ev.contentURI)) {
    return { ok: false, reason: "contentURI must be ipfs://<CID>[/path]" };
  }
  let body: string;
  try {
    body = await fetchIpfsText(ev.contentURI);
  } catch (e: any) {
    return { ok: false, reason: `gateway fetch failed: ${e?.message || e}` };
  }
  const hash = keccak256(toBytes(body));
  if (!eqHex32(hash, ev.contentHash)) {
    return {
      ok: false,
      reason: `hash mismatch: on-chain=${ev.contentHash} vs fetched=${hash}`,
    };
  }
  return { ok: true };
}

// tiny spinner
function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-transparent align-middle"
      aria-label="loading"
    />
  );
}

export default function OrganizerPage() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [pending, setPending] = useState<EventRec[]>([]);
  const [loading, setLoading] = useState(false);

  // per-item UI states
  const [validatingId, setValidatingId] = useState<bigint | null>(null);
  const [confirmingId, setConfirmingId] = useState<bigint | null>(null);
  const [rejectingId, setRejectingId] = useState<bigint | null>(null);

  async function load() {
    if (!address) return;
    setLoading(true);

    // 1) Fetch EventRequested logs for this organizer
    const logs = await publicClient.getLogs({
      address: PORTFOLIO_ADDRESS,
      event: {
        type: "event",
        name: "EventRequested",
        inputs: [
          { name: "id", type: "uint256", indexed: true },
          { name: "owner", type: "address", indexed: true },
          { name: "organizer", type: "address", indexed: true },
        ],
      },
      args: { organizer: address },
      fromBlock: BigInt(8998500),
      toBlock: "latest",
    });

    // 2) For each id => getEvent(id)
    const results: EventRec[] = [];
    for (const log of logs) {
      const id = log.args.id as bigint;
      try {
        const ev = await publicClient.readContract({
          address: PORTFOLIO_ADDRESS,
          abi: PORTFOLIO_ABI,
          functionName: "getEvent",
          args: [id],
        });
        // @ts-ignore
        if (ev.status === 0) {
          // Pending only
          // @ts-ignore
          results.push({ id, ...ev });
        }
      } catch (err) {
        console.error("getEvent failed", err);
      }
    }

    setPending(results);
    setLoading(false);
  }

  async function handleValidate(ev: EventRec) {
    try {
      setValidatingId(ev.id);
      const res = await validateContentURI(ev);
      alert(res.ok ? "OK: contentURI is valid and hash matches" : `Error: ${res.reason}`);
    } finally {
      setValidatingId(null);
    }
  }

  async function confirm(id: bigint) {
    const ev = pending.find((p) => p.id === id);
    if (!ev) return;

    // Validate before confirming
    setValidatingId(id);
    const res = await validateContentURI(ev);
    setValidatingId(null);
    if (!res.ok) {
      alert(`Cannot confirm: contentURI failed validation.\nReason: ${res.reason}`);
      return;
    }

    try {
      setConfirmingId(id);
      // No resultURI input for now — pass an empty string (adjust when you add real data)
      const tx = await writeContractAsync({
        address: PORTFOLIO_ADDRESS,
        abi: PORTFOLIO_ABI,
        functionName: "confirmEvent",
        args: [id, ""],
      });
      console.log("confirm tx:", tx);
      await load();
    } finally {
      setConfirmingId(null);
    }
  }

  async function rejectWithPin(id: bigint, reasonText: string) {
    const ev = pending.find((p) => p.id === id);
    if (!ev) return;

    try {
        setRejectingId(id);

        // Build payload with reason
        const payload = {
            status: "rejected",
            reason: reasonText,
            eventId: id.toString(),
            organizer: ev.organizer,
            at: new Date().toISOString(),
        };

        // Pin JSON to IPFS
        const pinRes = await fetch("/api/ipfs/pin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                content: payload,
                metadataName: `portfolio:reject:${id.toString()}`,
            }),
        });
        if (!pinRes.ok) {
            const err = await pinRes.json().catch(() => ({}));
            throw new Error(`Pin failed: ${err?.error ?? pinRes.statusText}`);
        }
        const { uri } = await pinRes.json(); // ipfs://CID

        // Call rejectEvent on contract
        const tx = await writeContractAsync({
            address: PORTFOLIO_ADDRESS,
            abi: PORTFOLIO_ABI,
            functionName: "rejectEvent",
            args: [id, uri],
        });
        console.log("reject tx:", tx);
        await load();
    } finally {
        setRejectingId(null);
    }
  }



  useEffect(() => {
    if (isConnected) load();
  }, [isConnected]);

  if (!isConnected) return <p>Please connect the organizer wallet.</p>;
  if (loading) return <p>Loading…</p>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Requests (Pending)</h1>
      {pending.length === 0 ? (
        <p>No requests to review.</p>
      ) : (
        <div className="space-y-4">
          {pending.map((ev) => {
            const isValidating = validatingId === ev.id;
            const isConfirming = confirmingId === ev.id;
            return (
              <div key={ev.id.toString()} className="border rounded-lg p-4">
                <div className="text-sm opacity-70">ID: {ev.id.toString()}</div>
                <div>owner: {ev.owner}</div>
                <div>
                  start: {new Date(Number(ev.startAt) * 1000).toLocaleDateString()}
                </div>
                <div>
                  end: {new Date(Number(ev.endAt) * 1000).toLocaleDateString()}
                </div>
                <div>contentURI: {ev.contentURI}</div>

                <div className="flex gap-2 mt-2">
                  <button
                    className="px-3 py-1 rounded border hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                    onClick={() => handleValidate(ev)}
                    disabled={isValidating || isConfirming}
                  >
                    {isValidating ? <Spinner /> : null}
                    {isValidating ? "Validating…" : "Validate"}
                  </button>

                  <button
                    className="px-3 py-1 rounded bg-black text-white disabled:opacity-50 flex items-center gap-2"
                    onClick={() => confirm(ev.id)}
                    disabled={isValidating || isConfirming}
                  >
                    {isConfirming ? <Spinner /> : null}
                    {isConfirming ? "Confirming…" : "Confirm"}
                  </button>

                  <button
                    className="px-3 py-1 rounded border text-red-700 hover:bg-red-50 disabled:opacity-50 flex items-center gap-2"
                    onClick={() => {
                        const reason = prompt("Enter rejection reason text:");
                        if (reason) rejectWithPin(ev.id, reason);
                    }}
                    disabled={rejectingId === ev.id || confirmingId === ev.id || validatingId === ev.id}
                    >
                    {rejectingId === ev.id ? <Spinner /> : null}
                    {rejectingId === ev.id ? "Rejecting…" : "Reject"}
                  </button>
                </div>

                <div className="mt-1 text-xs opacity-60">
                  Gateway:{" "}
                  <a
                    className="underline"
                    href={uriToGateway(ev.contentURI)}
                    target="_blank"
                  >
                    {uriToGateway(ev.contentURI)}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
