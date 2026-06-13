import { useEffect, useState } from "react";

export function useInfiniteScroll(initialCount = 10, step = 10) {
  const [visibleCount, setVisibleCount] = useState(initialCount);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight) {
        setVisibleCount((current) => current + step);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [step]);

  return visibleCount;
}