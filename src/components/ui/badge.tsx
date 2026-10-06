import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const variants = cva("inline-flex items-center rounded-sm border px-2 py-0.5 text-[11px] font-medium capitalize", {
  variants: { variant: { default: "border-transparent bg-emerald-50 text-emerald-800", secondary: "border-transparent bg-muted text-muted-foreground", outline: "border-border text-muted-foreground" } }, defaultVariants: { variant: "default" },
});
export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof variants>) { return <span data-slot="badge" className={cn(variants({ variant }), className)} {...props} />; }
