"use client";

import { useState } from "react";

type EventHeroImageProps = {
  imageUrl: string;
  title: string;
};

/**
 * Blurred backdrop + sharp contained image: works at any source resolution,
 * so small artist avatars don't look pixelated. Source image URLs go stale,
 * so the whole block disappears if the image fails to load.
 */
export function EventHeroImage({ imageUrl, title }: EventHeroImageProps) {
  const [hasImageFailed, setHasImageFailed] = useState(false);
  if (hasImageFailed) return null;

  return (
    <div className="sm:mx-6 aspect-[2/1] relative bg-ink-raised sm:rounded-lg overflow-hidden">
      <img
        src={imageUrl}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50 saturate-150"
      />
      <img
        src={imageUrl}
        alt={title}
        className="relative w-full h-full object-contain"
        onError={() => setHasImageFailed(true)}
      />
    </div>
  );
}
