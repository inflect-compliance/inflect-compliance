/**
 * SharePoint Field Mapper (SP-1).
 *
 * Maps a Graph `DriveItem` → IC `Evidence` field shape. Read-direction is the
 * load-bearing one (SharePoint files become evidence); the remote direction is
 * a thin identity pass-through (SP-4 policy write-back uploads raw content, it
 * doesn't field-map). Dot-notation paths resolve nested Graph fields via the
 * BaseFieldMapper engine.
 *
 * @module integrations/providers/sharepoint/mapper
 */
import { BaseFieldMapper, type FieldMappings, type FieldMapperOptions } from '../../base-mapper';

export class SharePointMapper extends BaseFieldMapper {
    /** Local IC field → Graph DriveItem field path. */
    protected readonly fieldMappings: FieldMappings = {
        title: 'name',
        sourceUrl: 'webUrl',
        eTag: 'eTag',
        mimeType: 'file.mimeType',
        sizeBytes: 'size',
        remoteUpdatedAt: 'lastModifiedDateTime',
    };

    constructor(options?: FieldMapperOptions) {
        super(options);
    }

    protected transformToRemote(_field: string, value: unknown): unknown {
        return value;
    }

    protected transformToLocal(field: string, value: unknown): unknown {
        // Normalise the Graph ISO timestamp to a Date for ETag/recency compares.
        if (field === 'remoteUpdatedAt' && typeof value === 'string') {
            return new Date(value);
        }
        return value;
    }
}
