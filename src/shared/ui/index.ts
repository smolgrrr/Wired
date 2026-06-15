/**
 * UI barrel — optional entry point for shared components.
 *
 * Convention:
 * - Primitives (Button, Input, Textarea, …) may be imported from this barrel.
 * - Feature-heavy components (PostCard, PageShell, TextContent, …) use direct
 *   file imports in feature code to avoid barrel churn and keep tree-shaking obvious.
 */

export { Button, type ButtonProps } from "./Button";
export { Input, type InputProps } from "./Input";
export { Textarea, type TextareaProps } from "./Textarea";
export { SegmentedControl, type SegmentedControlProps, type SegmentOption } from "./SegmentedControl";
export { SignalStepper } from "./SignalStepper";
export { SignalAvatar } from "./SignalAvatar";
export { MetadataRow } from "./MetadataRow";
export { ReplyContext } from "./ReplyContext";
export { PostCard } from "./PostCard";
export { PageShell, ContentColumn } from "./PageShell";
export { PowTransmitStatus } from "./PowTransmitStatus";
export { Placeholder } from "./Placeholder";