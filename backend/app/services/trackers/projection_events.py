"""Emit comment invalidations whenever durable tracker projections change.

The tracker has HTTP, webhook, poll, sweep, and recovery writers. A database
trigger covers all of them in their existing transaction, including a worker
that crashes after commit but before it could send a process-local signal.

Retry bookkeeping (``attempts``, ``next_attempt_at``) is not a visible change:
a failing op backing off would otherwise make every open viewer refetch on
each attempt. State and error changes still stream.
"""

from __future__ import annotations


def apply_schema(conn) -> None:
    """Install in the caller-selected comments schema after stream and tracker tables."""
    conn.execute(
        """
        CREATE OR REPLACE FUNCTION tracker_projection_changed() RETURNS trigger
        LANGUAGE plpgsql AS $function$
        DECLARE
            comment_key TEXT;
            thread_key TEXT;
            project_key TEXT;
            comment_scope TEXT;
            base_key TEXT;
            compare_key TEXT;
            next_cursor BIGINT;
        BEGIN
            IF TG_TABLE_NAME = 'tracked_threads' THEN
                IF TG_OP = 'UPDATE' AND
                   ROW(OLD.project_tracker_id, OLD.destination_generation,
                       OLD.connector_id, OLD.remote_container_id, OLD.container_path,
                       OLD.external_id, OLD.external_number, OLD.external_url,
                       OLD.link_state, OLD.paused_reason, OLD.body_authority,
                       OLD.remote_state, OLD.remote_version, OLD.last_title_hash,
                       OLD.pending_op_id, OLD.unlinked_at, OLD.lineage)
                   IS NOT DISTINCT FROM
                   ROW(NEW.project_tracker_id, NEW.destination_generation,
                       NEW.connector_id, NEW.remote_container_id, NEW.container_path,
                       NEW.external_id, NEW.external_number, NEW.external_url,
                       NEW.link_state, NEW.paused_reason, NEW.body_authority,
                       NEW.remote_state, NEW.remote_version, NEW.last_title_hash,
                       NEW.pending_op_id, NEW.unlinked_at, NEW.lineage) THEN
                    RETURN NEW;
                END IF;
                comment_key := CASE WHEN TG_OP = 'DELETE' THEN OLD.comment_id ELSE NEW.comment_id END;
            ELSIF TG_TABLE_NAME = 'sync_ops' THEN
                IF TG_OP = 'UPDATE' AND
                   ROW(OLD.state, OLD.sent_at,
                       OLD.external_result_id, OLD.last_error, OLD.expected_remote_state)
                   IS NOT DISTINCT FROM
                   ROW(NEW.state, NEW.sent_at,
                       NEW.external_result_id, NEW.last_error, NEW.expected_remote_state) THEN
                    RETURN NEW;
                END IF;
                thread_key := CASE WHEN TG_OP = 'DELETE' THEN OLD.tracked_thread_id
                                   ELSE NEW.tracked_thread_id END;
            ELSE
                IF TG_OP = 'UPDATE' AND
                   ROW(OLD.external_comment_id, OLD.external_url)
                   IS NOT DISTINCT FROM
                   ROW(NEW.external_comment_id, NEW.external_url) THEN
                    RETURN NEW;
                END IF;
                thread_key := CASE WHEN TG_OP = 'DELETE' THEN OLD.tracked_thread_id
                                   ELSE NEW.tracked_thread_id END;
            END IF;

            IF comment_key IS NULL THEN
                EXECUTE format('SELECT comment_id FROM %I.tracked_threads WHERE id = $1', TG_TABLE_SCHEMA)
                    INTO comment_key USING thread_key;
            END IF;
            IF comment_key IS NULL THEN
                RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
            END IF;
            EXECUTE format(
                'SELECT c.project_id, COALESCE(to_jsonb(c)->>''scope'', ''canvas''), '
                || 'to_jsonb(c)->>''base_commit'', to_jsonb(c)->>''compare_commit'' '
                || 'FROM %I.comments c WHERE c.id = $1 AND c.deleted_at IS NULL', TG_TABLE_SCHEMA
            ) INTO project_key, comment_scope, base_key, compare_key USING comment_key;
            IF project_key IS NULL THEN
                RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
            END IF;

            EXECUTE format(
                'INSERT INTO %I.comment_stream_heads(project_id) VALUES ($1) ON CONFLICT DO NOTHING',
                TG_TABLE_SCHEMA
            ) USING project_key;
            EXECUTE format(
                'UPDATE %I.comment_stream_heads SET cursor = cursor + 1 '
                || 'WHERE project_id = $1 RETURNING cursor', TG_TABLE_SCHEMA
            ) INTO next_cursor USING project_key;
            EXECUTE format(
                'INSERT INTO %I.comment_change_events '
                || '(project_id, cursor, comment_id, scope, base_commit, compare_commit, change_kind) '
                || 'VALUES ($1, $2, $3, $4, $5, $6, $7)', TG_TABLE_SCHEMA
            ) USING project_key, next_cursor, comment_key, comment_scope,
                    base_key, compare_key, 'projection';
            PERFORM pg_notify('prism_comment_changes',
                json_build_object('projectId', project_key, 'cursor', next_cursor)::text);
            RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END
        $function$;

        DROP TRIGGER IF EXISTS tracked_thread_comment_event ON tracked_threads;
        CREATE TRIGGER tracked_thread_comment_event
            AFTER INSERT OR UPDATE OR DELETE ON tracked_threads
            FOR EACH ROW EXECUTE FUNCTION tracker_projection_changed();
        DROP TRIGGER IF EXISTS sync_op_comment_event ON sync_ops;
        CREATE TRIGGER sync_op_comment_event
            AFTER INSERT OR UPDATE OR DELETE ON sync_ops
            FOR EACH ROW EXECUTE FUNCTION tracker_projection_changed();
        DROP TRIGGER IF EXISTS tracked_reply_comment_event ON tracked_replies;
        CREATE TRIGGER tracked_reply_comment_event
            AFTER INSERT OR UPDATE OR DELETE ON tracked_replies
            FOR EACH ROW EXECUTE FUNCTION tracker_projection_changed();
        """,
        prepare=False,
    )
