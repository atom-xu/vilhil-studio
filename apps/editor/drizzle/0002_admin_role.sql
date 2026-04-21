-- Better Auth admin 插件：给 user 表添加 role 字段
-- 运行方式：在数据库中执行

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'user';

-- 为现有用户设置默认角色
UPDATE "user" SET "role" = 'user' WHERE "role" IS NULL;
