import type { MessageImagesProps } from '@qilin-agent/client-ui-chat/client'
import { ImageGallery } from '../MessageImage.tsx'
import { messageImageLabels } from './labels.ts'

/** Historical message-image slot entry. */
export function MessageImages({ images, loadImage, align, compact = false, thumbnail = false, t, useContextMenu }: MessageImagesProps) {
  const { getTriggerProps } = useContextMenu()
  return (
    <ImageGallery
      images={images}
      load={loadImage}
      align={align}
      compact={compact}
      thumbnail={thumbnail}
      labels={messageImageLabels(t)}
      getTriggerProps={getTriggerProps}
    />
  )
}
