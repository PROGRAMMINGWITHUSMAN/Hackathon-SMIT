// Shared button so every button in the app looks and behaves the same.
// - variant: primary (solid brand green), secondary (surface + border), ghost
// - size:   sm | base | lg
// All colors come from the design tokens in globals.css (never raw hex).
// The exported buttonClasses() is for styling <a>/Link elements as buttons.

const VARIANTS = {
  primary:
    "bg-primary text-white hover:bg-primary-hover focus-visible:ring-focus",
  secondary:
    "border border-line bg-surface text-ink hover:bg-sage/60 focus-visible:ring-focus",
  ghost:
    "text-muted hover:bg-sage/60 hover:text-ink focus-visible:ring-focus",
};

const SIZES = {
  sm: "px-3 py-1.5 text-sm",
  base: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export function buttonClasses(variant = "primary", size = "base") {
  return [
    // rounded-xl sits between input/corners and the rounded-2xl panels,
    // so buttons inside cards never clash with the card's own radius.
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-60",
    VARIANTS[variant],
    SIZES[size],
  ].join(" ");
}

export default function Button({
  variant = "primary",
  size = "base",
  className = "",
  ...props
}) {
  return (
    <button
      className={`${buttonClasses(variant, size)} ${className}`}
      {...props}
    />
  );
}
