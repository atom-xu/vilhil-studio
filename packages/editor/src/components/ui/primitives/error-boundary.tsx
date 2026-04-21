'use client'

import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './button'

interface Props {
  children?: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-background p-4 text-foreground">
          <h2 className="mb-4 font-bold text-destructive text-xl">Something went wrong</h2>
          <pre className="max-w-full overflow-auto rounded-lg bg-muted/60 p-4 text-muted-foreground text-sm">
            {this.state.error?.message}
          </pre>
          <Button
            className="mt-4"
            onClick={() => this.setState({ hasError: false, error: null })}
            type="button"
            variant="default"
          >
            Try again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
