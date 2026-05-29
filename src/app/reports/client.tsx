"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toggleFavourite } from "./actions";

/**
 * Click toggles the user's favourite for the given slug.
 * Star fills when favourited.
 */
export function FavouriteStar({ slug, isFav }: { slug: string; isFav: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <button
      type="button"
      title={isFav ? "Remove from favourites" : "Add to favourites"}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const fd = new FormData();
          fd.set("slug", slug);
          await toggleFavourite(fd);
          router.refresh();
        });
      }}
      className={`shrink-0 h-9 w-9 rounded-md grid place-items-center transition-colors ${
        isFav ? "text-amber-500 bg-amber-50" : "text-muted-foreground hover:text-amber-500 hover:bg-amber-50"
      }`}
    >
      <Star className={`h-4 w-4 ${isFav ? "fill-amber-500" : ""}`} />
    </button>
  );
}
