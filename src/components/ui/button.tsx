import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4", {
  variants: {
    variant: { default: "bg-primary text-primary-foreground hover:bg-emerald-900", outline: "border border-border bg-transparent hover:bg-muted", ghost: "hover:bg-muted", secondary: "bg-muted text-foreground hover:bg-border" },
    size: { default: "h-10 px-4", sm: "h-8 px-3 text-xs", icon: "size-10" },
  }, defaultVariants: { variant: "default", size: "default" },
});
export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
