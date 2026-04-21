import {
  buildTopology,
  type TopologyDeviceInput,
} from '../../../../../../packages/smarthome/src/tools/topology-tools'
import { NextResponse } from 'next/server'

type RequestPayload = {
  devices?: TopologyDeviceInput[]
  levelId?: string | null
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestPayload
    const devices = Array.isArray(body.devices) ? body.devices : []
    const levelId = typeof body.levelId === 'string' ? body.levelId : null

    const topology = buildTopology(devices, { levelId, strategy: 'same-floor-first' })

    return NextResponse.json({
      ok: true,
      data: topology,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'invalid payload',
      },
      { status: 400 },
    )
  }
}
