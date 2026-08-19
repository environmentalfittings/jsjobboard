import type { ReceivedValveImage } from '../lib/receivedValveImages'

type ReceivedValvePhotosCellProps = {
  images: ReceivedValveImage[]
}

export function ReceivedValvePhotosCell({ images }: ReceivedValvePhotosCellProps) {
  if (!images.length) return <>—</>

  return (
    <div className="received-valves-photo-cell">
      {images.map((image, index) => (
        <a
          key={image.storage_path || `${image.url}-${index}`}
          href={image.url}
          target="_blank"
          rel="noreferrer"
          className="received-valves-image-link"
          title={image.file_name}
        >
          <img src={image.url} alt={image.file_name || `Photo ${index + 1}`} />
        </a>
      ))}
      {images.length > 1 ? <span className="received-valves-photo-count">{images.length}</span> : null}
    </div>
  )
}
