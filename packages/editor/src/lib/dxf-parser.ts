/**
 * DXF 解析器 — 提取 ASCII DXF 文件中的 LINE 实体
 *
 * 移植自 3Dhouse 项目，适配 TypeScript
 * 支持基本 ASCII DXF（ENTITIES 段 LINE 实体）
 * 不支持二进制 DXF / DWG（需要服务端 ODA 或 LibreDWG）
 */

export interface DxfWall {
  id: string
  start: { x: number; y: number }
  end: { x: number; y: number }
  thickness: number
  height: number
}

export interface DxfParseResult {
  walls: DxfWall[]
}

/**
 * 解析 ASCII DXF 文件内容，提取墙体线段
 */
export function parseDxfToWalls(fileContent: string): DxfParseResult {
  const walls: DxfWall[] = []

  if (!fileContent || typeof fileContent !== 'string') {
    return { walls }
  }

  const lines = fileContent.split(/\r?\n/)

  let inEntities = false
  let currentEntity: Record<string, any> | null = null
  let previousCode: string | null = null
  let wallIndex = 1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()

    if (line === 'SECTION') {
      const nextLine = lines[i + 1] ? lines[i + 1]!.trim() : ''
      if (nextLine === 'ENTITIES') {
        inEntities = true
      }
      continue
    }

    if (inEntities && line === 'ENDSEC') {
      if (currentEntity?.type === 'LINE') {
        const wall = buildWall(currentEntity, wallIndex++)
        if (wall) walls.push(wall)
      }
      inEntities = false
      currentEntity = null
      continue
    }

    if (!inEntities) continue

    if (line === 'LINE' && previousCode === '0') {
      if (currentEntity?.type === 'LINE') {
        const wall = buildWall(currentEntity, wallIndex++)
        if (wall) walls.push(wall)
      }
      currentEntity = { type: 'LINE' }
      previousCode = null
      continue
    }

    if (previousCode !== null) {
      const code = previousCode
      const value = line

      if (currentEntity) {
        switch (code) {
          case '10': currentEntity.x1 = parseFloat(value); break
          case '20': currentEntity.y1 = parseFloat(value); break
          case '30': currentEntity.z1 = parseFloat(value); break
          case '11': currentEntity.x2 = parseFloat(value); break
          case '21': currentEntity.y2 = parseFloat(value); break
          case '31': currentEntity.z2 = parseFloat(value); break
        }
      }
      previousCode = null
    } else {
      previousCode = line
    }
  }

  // 文件没有 ENDSEC 的情况
  if (currentEntity?.type === 'LINE') {
    const wall = buildWall(currentEntity, wallIndex++)
    if (wall) walls.push(wall)
  }

  return { walls }
}

function buildWall(entity: Record<string, any>, index: number): DxfWall | null {
  if (
    typeof entity.x1 !== 'number' ||
    typeof entity.y1 !== 'number' ||
    typeof entity.x2 !== 'number' ||
    typeof entity.y2 !== 'number'
  ) {
    return null
  }

  return {
    id: `dxf_w${index}`,
    start: { x: entity.x1, y: entity.y1 },
    end: { x: entity.x2, y: entity.y2 },
    thickness: 0.2,
    height: 2.6,
  }
}

/**
 * 读取 DXF 文件内容（File → string）
 */
export async function readDxfFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('DXF 文件读取失败'))
    reader.readAsText(file)
  })
}
