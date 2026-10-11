"use client"

import { GameFx } from "@workspace/ui/components/game-fx"
import { useTilt } from "@workspace/ui/hooks/use-tilt"
import { cn } from "@workspace/ui/lib/utils"

function CardBack({ className }: { className?: string }) {
  const { tilt, isTilting, tiltProps } = useTilt()

  return (
    <div
      data-slot="card-back"
      data-tilting={isTilting ? "" : undefined}
      className={cn("game-card-back w-full", className)}
      {...tiltProps}
    >
      <div className="game-card-back-body">
        <div className="game-card-back-face">
          <GameFx name="back" tilt={tilt} />
          <i className="game-disc" />
          <b className="mt-3 text-3xl font-black tracking-tight font-heading">
            MUSI
          </b>
          <span className="mt-2 text-xs font-semibold tracking-widest opacity-70">
            MASTER
          </span>
          <i className="game-glare" />
        </div>
      </div>
    </div>
  )
}

export { CardBack }
