"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import type { Address } from "viem";
import { PORTFOLIO_ABI, PORTFOLIO_ADDRESS } from "../../lib/contract";

const STATUS = {
    Pending: 0,
    Confirmed: 1,
    Rejected: 2,
} as const;

type EventRec = {
    id: bigint;
    owner: Address;
    organizer: Address;
    startAt: bigint;     // unix seconds
    endAt: bigint;       // unix seconds
    contentHash: `0x${string}`;
    contentURI: string;  // may be empty
    resultURI: string;   // may be empty
    reasonURI: string;   // may be empty
    status: number;      // 0/1/2
};

type EventOnChain = {
    owner: Address;
    organizer: Address;
    startAt: bigint;
    endAt: bigint;
    contentHash: `0x${string}`;
    contentURI: string;
    resultURI: string;
    reasonURI: string;
    status: number;
};


export default function OwnerCertificatesPage() {
    const { address, isConnected } = useAccount();
    const publicClient = usePublicClient();
    const [confirmed, setConfirmed] = useState<EventRec[]>([]);
    const [rejected, setRejected] = useState<EventRec[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const owner = useMemo(
        () => (address ?? "0x0000000000000000000000000000000000000000") as Address,
        [address]
    );

    async function load() {
        if (!publicClient || !address) return;
        setLoading(true);
        setErr(null);

        try {
            // 1) Get all requests created by this owner (from events)
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
                args: { owner }, // filter by owner address
                fromBlock: BigInt(8998500),
                toBlock: "latest",
            });

            // 2) For each id, call getEvent(id)
            const items: EventRec[] = [];
            for (const l of logs) {
                const id = l.args?.id as bigint;
                if (typeof id !== "bigint") continue;

                const ev = await publicClient.readContract({
                    address: PORTFOLIO_ADDRESS,
                    abi: PORTFOLIO_ABI,
                    functionName: "getEvent",
                    args: [id],
                }) as EventOnChain;

                const rec: EventRec = {
                    id,
                    owner: ev.owner,
                    organizer: ev.organizer,
                    startAt: ev.startAt,
                    endAt: ev.endAt,
                    contentHash: ev.contentHash,
                    contentURI: ev.contentURI,
                    resultURI: ev.resultURI,
                    reasonURI: ev.reasonURI,
                    status: ev.status,
                };

                items.push(rec);
            }

            // 3) Split into confirmed/rejected
            setConfirmed(items.filter((i) => i.status === STATUS.Confirmed));
            setRejected(items.filter((i) => i.status === STATUS.Rejected));
        } catch (e: any) {
            console.error(e);
            setErr(e?.message ?? "Failed to load certificates");
            setConfirmed([]);
            setRejected([]);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (isConnected) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected, address, publicClient]);

    if (!isConnected) {
        return (
            <div className="p-6">
                Connect the owner wallet to view certificates.
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-4xl p-6 space-y-8">
            <header>
                <h1 className="text-2xl font-semibold">My Certificates</h1>
                <p className="text-sm opacity-70 break-all">Owner: {address}</p>
            </header>

            <section>
                <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-xl font-medium">Confirmed</h2>
                    <button
                        onClick={load}
                        className="px-3 py-1 rounded border hover:bg-gray-50 disabled:opacity-50"
                        disabled={loading}
                    >
                        {loading ? "Refreshing…" : "Refresh"}
                    </button>
                </div>

                {err && <p className="text-red-600 mb-3">{err}</p>}
                {loading ? (
                    <p>Loading…</p>
                ) : confirmed.length === 0 ? (
                    <p className="opacity-70">No confirmed certificates yet.</p>
                ) : (
                    <div className="grid gap-3">
                        {confirmed.map((c) => (
                            <div key={c.id.toString()} className="rounded-xl border p-4">
                                <div className="text-sm opacity-70">
                                    ID: {c.id.toString()}
                                </div>
                                <div className="text-sm">
                                    Organizer: {c.organizer}
                                </div>
                                <div className="text-sm">
                                    Period:{" "}
                                    {new Date(Number(c.startAt) * 1000).toLocaleDateString()} —{" "}
                                    {new Date(Number(c.endAt) * 1000).toLocaleDateString()}
                                </div>
                                <div className="text-xs break-all mt-2">
                                    contentHash: {c.contentHash}
                                </div>
                                {/* contentURI/resultURI may be empty - show as is */}
                                {c.contentURI && (
                                    <div className="text-sm mt-1">
                                        contentURI: {c.contentURI}
                                    </div>
                                )}
                                {c.resultURI && (
                                    <div className="text-sm mt-1">
                                        resultURI: {c.resultURI}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section>
                <h2 className="text-xl font-medium mb-3">Rejected</h2>
                {loading ? (
                    <p>Loading…</p>
                ) : rejected.length === 0 ? (
                    <p className="opacity-70">No rejected requests yet.</p>
                ) : (
                    <div className="grid gap-3">
                        {rejected.map((r) => (
                            <div key={r.id.toString()} className="rounded-xl border p-4">
                                <div className="text-sm opacity-70">
                                    ID: {r.id.toString()}
                                </div>
                                <div className="text-sm">
                                    Organizer: {r.organizer}
                                </div>
                                <div className="text-sm">
                                    Period:{" "}
                                    {new Date(Number(r.startAt) * 1000).toLocaleDateString()} —{" "}
                                    {new Date(Number(r.endAt) * 1000).toLocaleDateString()}
                                </div>
                                <div className="text-xs break-all mt-2">
                                    contentHash: {r.contentHash}
                                </div>
                                {r.contentURI && (
                                    <div className="text-sm mt-1">
                                        contentURI: {r.contentURI}
                                    </div>
                                )}
                                {r.reasonURI && (
                                    <div className="text-sm mt-1">
                                        reasonURI: {r.reasonURI}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
