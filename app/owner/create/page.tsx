"use client";
import { useState, useMemo } from "react";

import { useAccount } from "wagmi";
import { keccak256, toBytes, isAddress, getAddress } from "viem";
import { useWriteContract } from "wagmi";
import { PORTFOLIO_ABI, PORTFOLIO_ADDRESS } from "../../lib/contract";

type EventFormData = {
  title: string;
  organizer: string;     // organizer address (string for now)
  startAt: string;       // YYYY-MM-DD
  endAt: string;         // YYYY-MM-DD
  description: string;   // short description
};

const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;

export default function CreateEventPage() {
  const { address, isConnected } = useAccount();

  const { writeContractAsync } = useWriteContract();

  const [data, setData] = useState<EventFormData>({
    title: "",
    organizer: "",
    startAt: "",
    endAt: "",
    description: "",
  });

  const [touched, setTouched] = useState<Record<keyof EventFormData, boolean>>({
    title: false,
    organizer: false,
    startAt: false,
    endAt: false,
    description: false,
  });

  const errors = useMemo(() => {
    const e: Partial<Record<keyof EventFormData, string>> = {};

    if (!data.title.trim()) e.title = "Please enter the event title.";
    if (!data.organizer.trim()) {
      e.organizer = "Please provide the organizer address.";
    } else if (!ethAddressRegex.test(data.organizer.trim())) {
      e.organizer = "Invalid Ethereum address format (0x...).";
    }
    if (!data.startAt) e.startAt = "Please select a start date.";
    if (!data.endAt) e.endAt = "Please select an end date.";
    if (data.startAt && data.endAt) {
      const start = new Date(data.startAt);
      const end = new Date(data.endAt);
      if (end < start) e.endAt = "End date cannot be earlier than start date.";
    }
    if (!data.description.trim()) e.description = "Please add a short description.";
    return e;
  }, [data]);

  const hasErrors = Object.keys(errors).length > 0;

  function setField<K extends keyof EventFormData>(key: K, value: EventFormData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function markTouched<K extends keyof EventFormData>(key: K) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Mark all fields as "touched"
    setTouched({ title: true, organizer: true, startAt: true, endAt: true, description: true });
    if (hasErrors) return;

    try {
      setSubmitting(true);

      // 1) Normalize organizer address
      if (!isAddress(data.organizer.trim())) {
        alert("Invalid organizer address");
        return;
      }
      const organizer = getAddress(data.organizer.trim());

      // 2) Prepare payload and the raw JSON string
      const payload = {
        title: data.title,
        description: data.description,
        startAt: data.startAt,
        endAt: data.endAt,
      };
      const content = JSON.stringify(payload); // Use the exact same string for hashing and uploading

      // 3) Pin JSON to IPFS through server route
      const pinRes = await fetch("/api/ipfs/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: payload, metadataName: `portfolio:${data.title}` }),
      });
      if (!pinRes.ok) {
        const err = await pinRes.json().catch(() => ({}));
        throw new Error(`Pinata failed: ${err?.error ?? pinRes.statusText}`);
      }
      const { uri, cid } = await pinRes.json(); // ipfs://<cid>

      // 4) Calculate keccak256 from the same JSON string
      const contentHash = keccak256(toBytes(content));

      // 5) Convert dates to seconds (UTC midnight when type="date")
      const startAtSec = Math.floor(new Date(data.startAt).getTime() / 1000);
      const endAtSec   = Math.floor(new Date(data.endAt).getTime() / 1000);

      // 6) Call the smart contract function
      const txHash = await writeContractAsync({
        address: PORTFOLIO_ADDRESS,
        abi: PORTFOLIO_ABI,
        functionName: "createEventRequest",
        args: [
          organizer as `0x${string}`,
          BigInt(startAtSec),
          BigInt(endAtSec),
          contentHash as `0x${string}`,
          uri,
        ],
      });

      alert("Event request submitted!");
      console.log("CID:", cid, "URI:", uri, "TX:", txHash);
    } catch (err: unknown) {
      var message: string;
      if (e instanceof Error) {
          message = e.message;
      } else {
          message = "Unknown error";
      }
      alert(`Error: ${message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Create Event Request</h1>

      {isConnected ? (
        <p className="mb-4 text-green-600">Connected address: {address}</p>
      ) : (
        <p className="mb-4 text-red-600">Wallet not connected</p>
      )}
      
      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            type="text"
            value={data.title}
            onChange={(e) => setField("title", e.target.value)}
            onBlur={() => markTouched("title")}
            placeholder="Example: Web3 Hackathon Final"
            className="w-full rounded-lg border px-3 py-2 outline-none focus:ring"
          />
          {touched.title && errors.title && (
            <p className="mt-1 text-sm text-red-600">{errors.title}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Organizer Address</label>
          <input
            type="text"
            value={data.organizer}
            onChange={(e) => setField("organizer", e.target.value)}
            onBlur={() => markTouched("organizer")}
            placeholder="0xabc... (Ethereum address)"
            className="w-full rounded-lg border px-3 py-2 outline-none focus:ring"
          />
          {touched.organizer && errors.organizer && (
            <p className="mt-1 text-sm text-red-600">{errors.organizer}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input
              type="date"
              value={data.startAt}
              onChange={(e) => setField("startAt", e.target.value)}
              onBlur={() => markTouched("startAt")}
              className="w-full rounded-lg border px-3 py-2 outline-none focus:ring"
            />
            {touched.startAt && errors.startAt && (
              <p className="mt-1 text-sm text-red-600">{errors.startAt}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Date</label>
            <input
              type="date"
              value={data.endAt}
              onChange={(e) => setField("endAt", e.target.value)}
              onBlur={() => markTouched("endAt")}
              className="w-full rounded-lg border px-3 py-2 outline-none focus:ring"
            />
            {touched.endAt && errors.endAt && (
              <p className="mt-1 text-sm text-red-600">{errors.endAt}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Short Description / Result</label>
          <textarea
            value={data.description}
            onChange={(e) => setField("description", e.target.value)}
            onBlur={() => markTouched("description")}
            rows={4}
            placeholder="What was achieved? Place, score, certificate, etc."
            className="w-full rounded-lg border px-3 py-2 outline-none focus:ring"
          />
          {touched.description && errors.description && (
            <p className="mt-1 text-sm text-red-600">{errors.description}</p>
          )}
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className={`rounded-xl px-4 py-2 text-white ${submitting ? "bg-gray-400" : "bg-black hover:opacity-90"}`}
          >
            {submitting ? "Submitting…" : "Create Event"}
          </button>
        </div>
      </form>

      {/* Preview of entered data (useful for debugging) */}
      <div className="mt-8">
        <h2 className="text-lg font-medium mb-2">Preview</h2>
        <pre className="whitespace-pre-wrap break-words rounded-lg border p-3 text-sm bg-white">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}
