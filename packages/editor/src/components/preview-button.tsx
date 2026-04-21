'use client'

import { Eye } from 'lucide-react'
import { Button } from './ui/primitives/button'
import useEditor from '../store/use-editor'

export function PreviewButton() {
  return (
    <Button
      className="vh-btn-secondary shadow-lg backdrop-blur-md"
      onClick={() => useEditor.getState().setPreviewMode(true)}
      size="sm"
      variant="outline"
    >
      <Eye className="h-4 w-4 shrink-0" />
      <span className="hidden whitespace-nowrap sm:inline">Preview</span>
    </Button>
  )
}
