import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "@workspace/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"
import { useEffect, useRef } from "react"

const gameShellVariants = cva(
  "group/game-shell inset-0 fixed flex flex-col overflow-hidden game-backdrop text-ink",
  {
    variants: {
      nav: {
        tabs: "md:pl-28",
        none: "",
      },
    },
    defaultVariants: { nav: "tabs" },
  }
)

function GameShell({
  className,
  nav,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof gameShellVariants>) {
  return (
    <div
      data-slot="game-shell"
      className={cn(gameShellVariants({ nav }), className)}
      {...props}
    />
  )
}

const gameMainVariants = cva(
  // Inside a `data-immersive` screen it steps aside, like the tab bar.
  "max-w-6xl px-4 sm:px-6 md:px-8 md:pt-8 min-h-0 not-has-data-[slot=game-scroll]:pb-24 md:not-has-data-[slot=game-scroll]:pb-8 in-data-immersive:-translate-y-4 mx-auto flex w-full flex-1 flex-col game-safe-top transition duration-300 in-data-immersive:opacity-0",
  {
    variants: {
      layout: {
        stack: "",
        // The whole screen scrolls, so content passes under the status bar.
        scroll: "overflow-y-auto overscroll-contain",
        focus: "gap-4 md:gap-8 lg:grid lg:grid-cols-2 lg:items-center lg:pt-0",
      },
    },
    defaultVariants: { layout: "stack" },
  }
)

function GameMain({
  className,
  layout,
  ...props
}: React.ComponentProps<"main"> & VariantProps<typeof gameMainVariants>) {
  return (
    <main
      data-slot="game-main"
      className={cn(gameMainVariants({ layout }), className)}
      {...props}
    />
  )
}

// A scrolling region under a fixed header; for a fully scrolling screen use
// `GameMain layout="scroll"`.
function GameScroll({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="game-scroll"
      className={cn(
        "min-h-0 -mx-4 px-4 pt-6 pb-28 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 md:pb-8 flex-1 overflow-y-auto overscroll-contain game-scroll-fade",
        className
      )}
      {...props}
    />
  )
}

// A screen marks itself `data-immersive` (e.g. a pack being opened) to send
// the tab bar away: down on phones, left on the desktop rail.
function GameTabBar({ className, ...props }: React.ComponentProps<"nav">) {
  const ref = useRef<HTMLElement>(null)

  // Slide the active pill from where it was (mid-flight included) to the new tab.
  useEffect(() => {
    const nav = ref.current
    if (!nav) return
    const observer = new MutationObserver((records) => {
      const from = records.find((record) => record.oldValue === "page")?.target
      const to = nav.querySelector('[aria-current="page"]')
      if (!(from instanceof HTMLElement) || !(to instanceof HTMLElement)) return
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
      const { m41, m42 } = new DOMMatrix(
        getComputedStyle(from, "::before").transform
      )
      const x = from.offsetLeft - to.offsetLeft + m41
      const y = from.offsetTop - to.offsetTop + m42
      to.animate(
        { transform: [`translate(${x}px, ${y}px)`, "none"] },
        {
          duration: 350,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          pseudoElement: "::before",
        }
      )
    })
    observer.observe(nav, {
      subtree: true,
      attributeFilter: ["aria-current"],
      attributeOldValue: true,
    })
    return () => observer.disconnect()
  }, [])

  return (
    <nav
      data-slot="game-tab-bar"
      className={cn(
        "inset-x-4 gap-2 p-1.5 md:inset-x-auto md:top-1/2 md:bottom-auto md:left-6 md:w-auto md:-translate-y-1/2 md:flex-col md:group-has-data-immersive/game-shell:-translate-x-[calc(100%+3rem)] md:group-has-data-immersive/game-shell:-translate-y-1/2 ease-out fixed game-safe-bottom z-40 flex rounded-full transition-[translate,visibility] duration-500 group-has-data-immersive/game-shell:invisible group-has-data-immersive/game-shell:translate-y-[calc(100%+5rem)]",
        className
      )}
      {...props}
      ref={ref}
    />
  )
}

function GameTab({
  className,
  render,
  ...props
}: useRender.ComponentProps<"a">) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "h-12 min-w-12 md:flex-none md:w-12 [&_svg]:size-5 before:inset-0 relative flex flex-1 items-center justify-center rounded-full transition-colors duration-300 outline-none before:absolute before:-z-10 before:rounded-full focus-visible:ring-4 focus-visible:ring-ring [&_svg]:shrink-0",
          className
        ),
      },
      props
    ),
    render,
    state: { slot: "game-tab" },
  })
}

function GamePill({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="game-pill"
      className={cn(
        "h-11 gap-1.5 pl-1.5 pr-3 text-sm has-data-[slot=game-avatar]:pl-1 inline-flex shrink-0 items-center rounded-full whitespace-nowrap",
        className
      )}
      {...props}
    />
  )
}

function GameStat({
  label,
  value,
  className,
  ...props
}: React.ComponentProps<"div"> & { label: string; value: React.ReactNode }) {
  return (
    <div
      data-slot="game-stat"
      className={cn("p-4 rounded-3xl bg-card", className)}
      {...props}
    >
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-2xl font-black font-heading">{value}</dd>
    </div>
  )
}

function GameProgress({
  label,
  value,
  max,
  className,
}: {
  label: string
  value: number
  max: number
  className?: string
}) {
  return (
    <div
      data-slot="game-progress"
      className={cn("p-5 rounded-3xl bg-card", className)}
    >
      <div className="gap-3 text-sm font-semibold flex justify-between">
        <span>{label}</span>
        <span className="text-xs font-mono text-muted-foreground">
          {value.toLocaleString("en")} / {max.toLocaleString("en")}
        </span>
      </div>
      <progress
        className="mt-4 h-2.5 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-brand"
        value={value}
        max={max}
        aria-label={label}
      />
    </div>
  )
}

export {
  GameMain,
  GamePill,
  GameProgress,
  GameScroll,
  GameShell,
  GameStat,
  GameTab,
  GameTabBar,
}
