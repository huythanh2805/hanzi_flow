import Image, { getImageProps } from "next/image";
import type { CSSProperties } from "react";
import moonValley from "../../public/images/study-moon-valley.png";
import { MoonlightOverlay } from "./moonlight-overlay";

// Shared CSS backgrounds also use Next's optimized, cached image variants.
const { props: cardScene } = getImageProps({
  src: moonValley,
  alt: "",
  width: 960,
  height: 540,
});
const sceneImageSet = cardScene.srcSet
  ?.split(", ")
  .map((candidate) => {
    const [url, density] = candidate.split(" ");
    return `url("${url}") ${density}`;
  })
  .join(", ");
export const cardSceneStyle = {
  "--card-scene-image": sceneImageSet
    ? `image-set(${sceneImageSet})`
    : `url("${cardScene.src}")`,
} as CSSProperties;

export function AppAmbience({
  moonlightEnabled = false,
}: {
  moonlightEnabled?: boolean;
}) {
  return (
    <div
      className="app-ambience"
      data-moonlight={moonlightEnabled ? "on" : "off"}
      aria-hidden="true"
    >
      <Image
        src={moonValley}
        alt=""
        fill
        sizes="100vw"
        placeholder="blur"
        loading="eager"
        fetchPriority="low"
        className="app-ambience-image"
      />
      {moonlightEnabled && <MoonlightOverlay />}
    </div>
  );
}

export function SceneArtwork({
  className = "",
  sizes = "(max-width: 767px) 100vw, 50vw",
}: {
  className?: string;
  sizes?: string;
}) {
  return (
    <Image
      src={moonValley}
      alt=""
      fill
      sizes={sizes}
      placeholder="blur"
      className={`scene-artwork ${className}`}
    />
  );
}

export function SidebarAmbience() {
  return (
    <Image
      src={moonValley}
      alt=""
      fill
      sizes="260px"
      placeholder="blur"
      className="sidebar-note-scene"
    />
  );
}
