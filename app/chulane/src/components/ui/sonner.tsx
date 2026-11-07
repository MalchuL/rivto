/**
 * Provides the shadcn-generated Sonner host using application colors and icons.
 * Mounted once by ErrorNotifications; notification producers use the service
 * interface instead of depending on this presentation component.
 */
"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const classes = { root: "toaster group", icon: "size-4", spinner: "size-4 animate-spin", toast: "cn-toast" }

/** @param props - Sonner host options. @returns The themed application toast region. */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className={classes.root}
      icons={{
        success: (
          <CircleCheckIcon className={classes.icon} />
        ),
        info: (
          <InfoIcon className={classes.icon} />
        ),
        warning: (
          <TriangleAlertIcon className={classes.icon} />
        ),
        error: (
          <OctagonXIcon className={classes.icon} />
        ),
        loading: (
          <Loader2Icon className={classes.spinner} />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: classes.toast,
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
