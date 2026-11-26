/**
 * Skeleton - loading placeholder shaped like the content it replaces, so the
 * layout does not jump when data arrives.
 */
export default function Skeleton({ className = "", rounded = "rounded-xl" }) {
  return (
    <div
      aria-hidden="true"
      className={`skeleton ${rounded} ${className}`}
    />
  );
}
