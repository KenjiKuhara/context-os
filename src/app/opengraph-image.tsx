import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "context-os — AI-assisted task management";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#141414",
          color: "#d4d4d4",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "#007fd4",
            letterSpacing: "-2px",
            marginBottom: 24,
          }}
        >
          context-os
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#858585",
            textAlign: "center",
            maxWidth: 800,
            lineHeight: 1.5,
          }}
        >
          AIが提案し、人間が決定する
        </div>
        <div
          style={{
            fontSize: 20,
            color: "#4ec994",
            marginTop: 32,
            padding: "8px 24px",
            border: "1px solid #4ec994",
            borderRadius: 8,
          }}
        >
          外部作業記憶OS
        </div>
      </div>
    ),
    size
  );
}
