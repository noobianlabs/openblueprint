import { ImageResponse } from "next/og";

export const runtime = "edge";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 24,
          background: "#3ddbb4",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 24,
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="100"
          height="100"
        >
          <g
            fill="none"
            stroke="#000"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="12,6 15,8 15,12 12,14 9,12 9,8" />
          </g>
        </svg>
      </div>
    ),
    {
      width: 180,
      height: 180,
    }
  );
}
