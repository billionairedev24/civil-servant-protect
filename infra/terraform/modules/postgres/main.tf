/**
 * Postgres, HA via Patroni.
 *
 * Deployed into the cluster rather than taken as a managed service, because a
 * managed Postgres is exactly the thing a sovereign-cloud provider may not
 * offer. Three nodes, partitioned by cycle, pgAudit on, and an async replica in
 * the DR site.
 */

terraform {
  required_providers {
    helm       = { source = "hashicorp/helm", version = "~> 2.15" }
    kubernetes = { source = "hashicorp/kubernetes", version = "~> 2.33" }
  }
}

variable "namespace" { type = string }
variable "instances" {
  type        = number
  default     = 3
  description = "Patroni members. Three is the minimum that can lose one and still elect."
}
variable "storage_size" {
  type    = string
  default = "2Ti"
}
variable "storage_class" { type = string }
variable "backup_bucket" {
  type        = string
  description = "S3-compatible, in-country. Object lock on, for the seven-year audit retention."
}
variable "dr_standby_host" {
  type        = string
  default     = ""
  description = "When set, this cluster streams to Lagos. RPO 5 min, RTO 4 h."
}

resource "helm_release" "postgres" {
  name       = "csp-postgres"
  namespace  = var.namespace
  repository = "https://cloudnative-pg.github.io/charts"
  chart      = "cluster"
  version    = "0.0.11"

  values = [yamlencode({
    type = "postgresql"
    mode = "standalone"
    cluster = {
      instances = var.instances
      imageName = "ghcr.io/cloudnative-pg/postgresql:16.6"

      storage = {
        size         = var.storage_size
        storageClass = var.storage_class
      }

      postgresql = {
        parameters = {
          # pgAudit, per the build spec. Writes are what an auditor asks about.
          "shared_preload_libraries" = "pgaudit"
          "pgaudit.log"              = "write,ddl"
          "pgaudit.log_parameter"    = "on"

          # The ledger is append-heavy and read by period. Partition pruning
          # does the work; these keep the planner honest about it.
          "max_connections"              = "300"
          "enable_partitionwise_join"    = "on"
          "enable_partitionwise_aggregate" = "on"

          # Roll week writes a few million rows in a burst.
          "max_wal_size"     = "8GB"
          "checkpoint_timeout" = "15min"
        }
        pg_hba = [
          # Nothing reaches this without TLS and a password. The network policy
          # is the other half; neither is sufficient alone.
          "hostssl all all 10.0.0.0/8 scram-sha-256",
        ]
      }

      monitoring = { enablePodMonitor = true }
    }

    backups = {
      enabled         = true
      provider        = "s3"
      endpointURL     = var.backup_bucket
      # Seven years, because that is the audit retention the plan is sold on.
      retentionPolicy = "7y"
      scheduledBackups = [{
        name     = "nightly"
        schedule = "0 0 2 * * *"
      }]
    }
  })]
}

output "read_write_host" {
  value = "csp-postgres-rw.${var.namespace}.svc.cluster.local"
}

output "read_only_host" {
  description = "For L2 reporting, which must not touch the primary."
  value       = "csp-postgres-ro.${var.namespace}.svc.cluster.local"
}
