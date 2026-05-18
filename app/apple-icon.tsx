import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#04342c",
          borderRadius: 40,
          display: "flex",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 38,
            left: 50,
            width: 100,
            height: 90,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 65% 35%, #ffe19c 0%, #f4b033 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 60,
            left: 28,
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: "#1d9e75",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
