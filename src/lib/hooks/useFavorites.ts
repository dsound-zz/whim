"use client";

import { useState, useEffect } from "react";

const FAVORITES_KEY = "whim_favorite_events";

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    setIsMounted(true);
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      if (stored) {
        setFavorites(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to parse favorites from local storage", e);
    }
  }, []);

  // Sync state to local storage
  const updateFavorites = (newFavorites: string[]) => {
    setFavorites(newFavorites);
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
    } catch (e) {
      console.error("Failed to save favorites to local storage", e);
    }
  };

  const toggleFavorite = (eventId: string) => {
    if (favorites.includes(eventId)) {
      updateFavorites(favorites.filter((id) => id !== eventId));
    } else {
      updateFavorites([...favorites, eventId]);
    }
  };

  const isFavorite = (eventId: string) => favorites.includes(eventId);

  // Return empty array during SSR to prevent hydration mismatches
  if (!isMounted) {
    return {
      favorites: [],
      toggleFavorite: () => {},
      isFavorite: () => false,
    };
  }

  return { favorites, toggleFavorite, isFavorite };
}
