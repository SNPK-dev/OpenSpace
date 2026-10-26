export interface Dimensions {
  width: number
  height: number
  type?: string
}

export declare function imageSize(input: Uint8Array): Dimensions
export declare const disableTypes: (types: string[]) => void
export declare const types: string[]
export default imageSize
