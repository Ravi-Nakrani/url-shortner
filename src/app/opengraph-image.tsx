import { ImageResponse } from "next/og";

export const alt = "URL Shortener — shorten a link, track every click";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#faf9f6",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ fontSize: 72, fontWeight: 700, color: "#1c1c1e" }}>URL Shortener</div>
      <div style={{ fontSize: 32, color: "#6b6b6f", marginTop: 24 }}>
        Shorten a link. Track every click.
      </div>
      <div
        style={{
          marginTop: 48,
          fontSize: 24,
          color: "#1d5c4f",
          fontFamily: "monospace",
        }}
      >
        yourdomain.com/aB3xK9p
      </div>
    </div>,
    { ...size },
  );
}
