import { setupSsrCookies, channelsApi } from '@/lib/api/server-fetch';
import { ChannelsClient } from './client';

export const dynamic = 'force-dynamic';

export default async function ChannelsPage() {
  await setupSsrCookies();
  const [providersResp, statusResp, connectionsResp] = await Promise.allSettled([
    channelsApi.providers(),
    channelsApi.serviceStatus(),
    channelsApi.listConnections()
  ]);

  const providers = providersResp.status === 'fulfilled' ? providersResp.value.providers : [];
  const status = statusResp.status === 'fulfilled' ? statusResp.value : null;
  const connections =
    connectionsResp.status === 'fulfilled' ? connectionsResp.value.connections : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">渠道</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          8 大外部渠道连接管理(钉钉 / Discord / 飞书 / GitHub / Slack / Telegram / 微信 / 企业微信)
        </p>
      </div>
      <ChannelsClient
        initialProviders={providers}
        initialStatus={status}
        initialConnections={connections}
      />
    </div>
  );
}
