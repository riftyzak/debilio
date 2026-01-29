import { useMemo } from "react";

interface BackgroundTextProps {
  text: string;
  rows: number;
  cols: number;
  className?: string;
  id?: string;
}

export default function BackgroundText({ text, rows, cols, className, id }: BackgroundTextProps) {
  const lines = useMemo(() => {
    return Array.from({ length: rows }, () => text.repeat(cols));
  }, [rows, cols, text]);

  return (
    <div className={className} id={id}>
      {lines.map((line, index) => (
        <div key={`${line}-${index}`}>{line}</div>
      ))}
    </div>
  );
}
