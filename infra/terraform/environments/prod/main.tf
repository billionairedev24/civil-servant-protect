/**
 * prod — GBB Abuja.
 *
 * L3 data: Nigeria only. The Kubernetes endpoint is provisioned by GBB's
 * technical services team and handed over; nothing here creates a cluster,
 * because on a sovereign cloud there is no API that would.
 */

terraform {
  required_version = ">= 1.9"

  backend "s3" {
    # In-country, S3-compatible (MinIO/Ceph). The state file names every host in
    # the estate, so it never leaves Nigeria — the same rule as the data.
    bucket                      = "csp-terraform-state"
    key                         = "prod/terraform.tfstate"
    region                      = "ng-abuja-1"
    endpoints                   = { s3 = "https://objects.abuja.gbb.gov.ng" }
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    use_path_style              = true
    encrypt                     = true
    dynamodb_table              = "" # locking via the object store's own conditional writes
  }

  required_providers {
    kubernetes = { source = "hashicorp/kubernetes", version = "~> 2.33" }
    helm       = { source = "hashicorp/helm", version = "~> 2.15" }
    vault      = { source = "hashicorp/vault", version = "~> 4.4" }
  }
}

locals {
  namespace = "csp-prod"
  site      = "gbb-abuja"
}

resource "kubernetes_namespace" "csp" {
  metadata {
    name = local.namespace
    labels = {
      "csp.ng/site"                = local.site
      "csp.ng/data-classification" = "L3"
      # The chart's network policies select on this.
      "kubernetes.io/metadata.name" = local.namespace
    }
  }
}

module "postgres" {
  source = "../../modules/postgres"

  namespace     = kubernetes_namespace.csp.metadata[0].name
  instances     = 3
  storage_size  = "2Ti"
  storage_class = "nvme"
  backup_bucket = "https://objects.abuja.gbb.gov.ng/csp-backups"

  # Lagos. Async, RPO 5 minutes, RTO 4 hours.
  dr_standby_host = "csp-postgres-rw.csp-dr.svc.cluster.local"
}

/**
 * Secrets come from Vault, backed by the in-country HSM. Terraform wires up the
 * path and the Kubernetes auth role; it never reads a secret value, so none is
 * written to state. That is the whole reason for doing it this way.
 */
resource "vault_kubernetes_auth_backend_role" "api" {
  backend                          = "kubernetes"
  role_name                        = "csp-api"
  bound_service_account_names      = ["csp-api"]
  bound_service_account_namespaces = [local.namespace]
  token_policies                   = ["csp-api"]
  token_ttl                        = 3600
}

output "postgres_host" { value = module.postgres.read_write_host }
output "postgres_read_host" { value = module.postgres.read_only_host }
