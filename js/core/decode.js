/**
 * 画像ファイルのデコード。
 * EXIF の向き（Orientation）は、iOS 17 以降の Safari と最近の PC ブラウザでは
 * <img> を canvas に描くときに自動で画素へ反映される。自前で EXIF を読んで回転させると
 * 二重に回転してしまうため、ブラウザの処理に任せる。
 */

export class DecodeError extends Error {
  constructor(message) {
    super(message)
    this.name = 'DecodeError'
  }
}

function isHeic(file) {
  return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
}

function decodeWithImg(file) {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  return img
    .decode()
    .then(() => ({
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close() {
        img.src = ''
        URL.revokeObjectURL(url)
      },
    }))
    .catch((err) => {
      URL.revokeObjectURL(url)
      throw err
    })
}

async function decodeWithBitmap(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    close() {
      bitmap.close()
    },
  }
}

/**
 * @param {File} file
 * @returns {Promise<{source: CanvasImageSource, width: number, height: number, close: () => void}>}
 *   width / height は向きを反映したあとの大きさ。使い終わったら必ず close() を呼ぶ。
 */
export async function decodeImage(file) {
  try {
    const decoded = await decodeWithImg(file)
    if (decoded.width > 0 && decoded.height > 0) return decoded
    decoded.close()
  } catch {
    // <img> で読めなければ createImageBitmap を試す
  }
  try {
    if (typeof createImageBitmap === 'function') return await decodeWithBitmap(file)
  } catch {
    // 下でまとめてエラーにする
  }
  if (isHeic(file)) {
    throw new DecodeError(
      'HEIC形式の画像を読み込めませんでした。写真アプリから選ぶと自動でJPEGに変換されます',
    )
  }
  throw new DecodeError('画像を読み込めませんでした（対応していない形式か、ファイルが壊れています）')
}
