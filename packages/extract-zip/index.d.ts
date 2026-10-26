export interface Options {
  dir: string
  defaultDirMode?: number | string
  defaultFileMode?: number | string
  onEntry?: (entry: unknown, zipfile: unknown) => void
}

declare function extract(source: string, options: Options): Promise<void>
export = extract
