import { registry } from '@/rivet/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DEV_RUNNER_VERSION = Math.floor(Date.now() / 1000)

function getPublicUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL
    ?? process.env.NEXT_PUBLIC_VERCEL_URL
    ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`
}

function configureRegistryForNextRoute() {
  registry.config.serveManager = false
  registry.config.serverless = {
    ...registry.config.serverless,
    basePath: '/',
  }
  registry.config.noWelcome = true

  const hasExplicitEndpoint = Boolean(process.env.RIVET_ENDPOINT)
  const shouldAutoSpawnLocalEngine = !hasExplicitEndpoint && !process.env.VERCEL

  if (shouldAutoSpawnLocalEngine) {
    registry.config.serverless.spawnEngine = true
    registry.config.serverless.configureRunnerPool = {
      url: `${getPublicUrl()}/api/rivet`,
      minRunners: 0,
      maxRunners: 100_000,
      requestLifespan: 300,
      slotsPerRunner: 1,
      metadata: { provider: 'next-js' },
    }
    registry.config.runner = {
      ...registry.config.runner,
      version: DEV_RUNNER_VERSION,
    }
    return
  }

  registry.config.serverless.spawnEngine = false
  delete registry.config.serverless.configureRunnerPool
}

configureRegistryForNextRoute()

async function handle(
  request: Request,
  { params }: { params: Promise<{ all: string[] }> }
): Promise<Response> {
  const { all } = await params
  const targetUrl = new URL(request.url)
  targetUrl.pathname = `/${all.join('/')}`
  return registry.handler(new Request(targetUrl, request))
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
export const HEAD = handle
export const OPTIONS = handle
