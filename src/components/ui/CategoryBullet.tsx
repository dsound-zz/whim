import type { CSSProperties } from "react";
import { getCategoryConfig } from "@/lib/utils/categoryConfig";

type CategoryBulletProps = {
  category: string | null | undefined;
  shouldShowLabel?: boolean;
  className?: string;
};

export function CategoryBullet({ category, shouldShowLabel = true, className = "" }: CategoryBulletProps) {
  const categoryConfig = getCategoryConfig(category);
  const bulletStyle = { "--bullet-color": categoryConfig.hex } as CSSProperties;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="line-bullet" style={bulletStyle} aria-hidden="true" />
      {shouldShowLabel && <span>{categoryConfig.label}</span>}
    </span>
  );
}
