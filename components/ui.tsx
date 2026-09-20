import { type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function LampMark({ className = "lamp-mark" }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl font-display text-[13px] font-bold text-[hsl(222_30%_8%)]",
        className,
      )}
      style={{
        background: "linear-gradient(145deg, hsl(199 95% 58%), hsl(210 90% 48%))",
        boxShadow: "0 0 24px hsl(199 95% 58% / 0.35)",
      }}
    >
      L
    </span>
  );
}

export function Button({
  variant = "copper",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "copper" | "ghost" | "ink" }) {
  const look = {
    copper:
      "border border-copper/45 text-[hsl(222_30%_8%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_4px_16px_-2px_hsl(199_95%_55%/0.4)] hover:brightness-110",
    ink: "bg-paper-deep text-ink border border-white/10 hover:bg-white/5",
    ghost: "bg-transparent text-ink/80 border border-transparent hover:bg-white/[0.05] hover:text-ink",
  }[variant];
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[0.625rem] px-4 py-2 text-sm font-semibold transition disabled:opacity-50",
        variant === "copper" && "bg-[linear-gradient(180deg,hsl(199_95%_55%)_0%,hsl(210_90%_42%)_100%)]",
        look,
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-ink outline-none transition placeholder:text-ink-soft focus:border-copper focus:shadow-[0_0_0_3px_hsl(199_95%_55%/0.25)]",
        props.className,
      )}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-28 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-soft focus:border-copper focus:shadow-[0_0_0_3px_hsl(199_95%_55%/0.25)]",
        props.className,
      )}
    />
  );
}

export function Select(props: InputHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...props}
      className={cn(
        "h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-ink outline-none focus:border-copper focus:shadow-[0_0_0_3px_hsl(199_95%_55%/0.25)]",
        props.className,
      )}
    >
      {props.children}
    </select>
  );
}

export function Paper({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-[hsl(222_24%_10%/0.92)] p-5 shadow-[0_0_0_1px_hsl(199_95%_55%/0.05),0_20px_50px_-30px_rgba(0,0,0,0.75)] backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  children,
  tone = "rule",
}: {
  children: ReactNode;
  tone?: "rule" | "copper" | "forest";
}) {
  const look = {
    rule: "border-white/10 bg-white/[0.04] text-ink-soft",
    copper: "border-copper/35 bg-copper/15 text-copper",
    forest: "border-forest/40 bg-forest/15 text-forest",
  }[tone];
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium", look)}>
      {children}
    </span>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <Paper className="text-center">
      <p className="display text-xl font-semibold">{title}</p>
      <p className="mt-2 text-sm text-ink-soft">{body}</p>
    </Paper>
  );
}
