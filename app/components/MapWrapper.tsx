"use client";

import dynamic from "next/dynamic";

const SinulogMap = dynamic(() => import("./SinulogMap"), {
  ssr: false,
});

export default function MapWrapper() {
  return <SinulogMap />;
}
