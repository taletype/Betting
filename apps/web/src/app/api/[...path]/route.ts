import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";

async function handleRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  const apiPath = path.join("/");
  const url = new URL(request.url);
  const searchParams = url.search;

  try {
    const targetUrl = `${API_BASE_URL}/${apiPath}${searchParams}`;
    
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    
    // Forward relevant headers
    const forwardedHeaders = ["x-user-id", "x-admin-token", "idempotency-key"];
    for (const header of forwardedHeaders) {
      const value = request.headers.get(header);
      if (value) {
        headers[header] = value;
      }
    }

    const body = request.method !== "GET" && request.method !== "HEAD" 
      ? await request.text()
      : undefined;

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });

    const responseBody = await response.text();
    
    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    console.error(`Error proxying to /${apiPath}:`, error);
    return NextResponse.json(
      { error: "Failed to fetch market data" },
      { status: 500 }
    );
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const DELETE = handleRequest;
export const PATCH = handleRequest;
