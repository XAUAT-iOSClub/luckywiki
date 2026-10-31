-- ArticleStatus: 新增 ARCHIVED（已归档）枚举值
DO $$
BEGIN
    ALTER TYPE "ArticleStatus" ADD VALUE 'ARCHIVED';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- LogAction: 新增 ARCHIVE_ARTICLE / RESTORE_ARTICLE / HARD_DELETE_ARTICLE
DO $$
BEGIN
    BEGIN
        ALTER TYPE "LogAction" ADD VALUE 'ARCHIVE_ARTICLE';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER TYPE "LogAction" ADD VALUE 'RESTORE_ARTICLE';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER TYPE "LogAction" ADD VALUE 'HARD_DELETE_ARTICLE';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END $$;
