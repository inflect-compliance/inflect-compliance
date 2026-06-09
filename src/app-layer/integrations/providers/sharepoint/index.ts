/**
 * SharePoint Integration — Provider Module Index (SP-1).
 *
 * File layout (mirrors providers/github/):
 *   providers/sharepoint/
 *     ├── index.ts    ← this barrel
 *     ├── types.ts    ← Graph SharePoint shapes
 *     ├── client.ts   ← SharePointClient (BaseIntegrationClient)
 *     ├── mapper.ts   ← SharePointMapper (BaseFieldMapper)
 *     ├── token.ts    ← delegated-token lifecycle (consent + refresh)
 *     └── service.ts  ← connection-management usecases
 *
 * @module integrations/providers/sharepoint
 */
export { SharePointClient, encodeRemoteId, decodeRemoteId, extractDeltaToken } from './client';
export type { SharePointConnectionConfig } from './client';
export { SharePointMapper } from './mapper';
export {
    SHAREPOINT_SCOPES,
    buildSharePointAuthorizeUrl,
    exchangeCodeForSharePointToken,
    resolveSharePointAccessToken,
} from './token';
export type { SharePointSecret } from './token';
export {
    SHAREPOINT_PROVIDER,
    completeSharePointConnect,
    getSharePointClient,
    testSharePointConnection,
    listSharePointSites,
    updateSharePointAllowedSites,
    disconnectSharePoint,
    listSharePointConnections,
    getSharePointSitesAndDrives,
    browseSharePoint,
} from './service';
export type { SpBrowseItem } from './service';
export {
    importSharePointItems,
    runSharePointDeltaSync,
    SP_IMPORT_MAX_ITEMS,
} from './import';
export type { SpImportInput, SpImportResult, SpDeltaSyncResult } from './import';
export type * from './types';
