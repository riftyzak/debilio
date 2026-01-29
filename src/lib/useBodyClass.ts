import { useEffect } from "react";

export default function useBodyClass(className: string) {
  useEffect(() => {
    const previous = document.body.className;
    document.body.className = className;
    return () => {
      document.body.className = previous;
    };
  }, [className]);
}
