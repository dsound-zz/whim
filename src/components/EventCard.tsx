import Image from "next/image";
import { formatPrice } from "@/lib/utils/formatPrice";

type EventProps = {
  title: string;
  venueName: string;
  startAt: string;
  imageUrl?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  isFree?: boolean | null;
  ticketUrl?: string | null;
};

export function EventCard({ title, venueName, startAt, imageUrl, priceMin, priceMax, isFree, ticketUrl }: EventProps) {
  const formattedDate = new Date(startAt).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="glass rounded-2xl overflow-hidden group hover:-translate-y-1 transition-all duration-300 hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] flex flex-col">
      <div className="relative w-full h-48 bg-slate-800">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
            No Image
          </div>
        )}
        <div className="absolute top-3 right-3 glass px-3 py-1 rounded-full text-xs font-semibold text-white">
          {formatPrice(isFree ?? false, priceMin ?? null, priceMax ?? null, ticketUrl ?? null)}
        </div>
      </div>
      
      <div className="p-5 flex flex-col flex-grow">
        <h3 className="text-lg font-bold text-white mb-2 line-clamp-2 leading-tight group-hover:text-accent transition-colors">
          {title}
        </h3>
        <p className="text-slate-400 text-sm mb-4 line-clamp-1">{venueName}</p>
        <div className="mt-auto">
          <p className="text-slate-300 text-sm font-medium">{formattedDate}</p>
        </div>
      </div>
    </div>
  );
}
