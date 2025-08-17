import { NextResponse } from "next/server";

type PinRequestBody = {
  content: Record<string, unknown>; // или { [key: string]: unknown }
  metadataName?: string;
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as PinRequestBody;
        // expect { content: object, metadataName?: string }
        if (!body?.content || typeof body.content !== "object") {
        return NextResponse.json({ error: "content is required (object)" }, { status: 400 });
        }

        const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.PINATA_JWT!}`,
        },
        body: JSON.stringify({
            pinataOptions: { cidVersion: 1 },
            pinataMetadata: {
            name: body.metadataName ?? "portfolio-event",
            keyvalues: { app: "portfolio-dapp" },
            },
            pinataContent: body.content,
        }),
        });

        if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `Pinata error: ${text}` }, { status: 502 });
        }

        const data = await res.json(); // classic pinata response: { IpfsHash, PinSize, Timestamp }
        const cid: string = data.IpfsHash;
        const uri = `ipfs://${cid}`;
        const gateway = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs/";
        const gatewayUrl = `${gateway}${cid}`;

        return NextResponse.json({ cid, uri, gatewayUrl });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
    }
}
