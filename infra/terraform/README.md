# Terraform

Owns everything the chart does not: the cluster, Postgres, Redis, object storage,
and the DNS in front. The chart owns workloads; Terraform owns the ground they
stand on. The line matters — a Helm chart that can create a database is a chart
that will eventually delete one.

Cloud-agnostic on purpose. Under the 2026 Cloud Policy a federal plan runs on
GBB's sovereign cloud or a NITDA-registered provider through the GBB
marketplace, and GBB has no self-serve API — capacity is scoped by their
technical services team and handed over as VMs. So the modules here take an
already-provisioned Kubernetes endpoint rather than creating one, and everything
above it is portable.

    environments/
      dev/    synthetic roll, mock NIMC and SMS
      uat/    OAGF anonymised extract, NIMC sandbox, one pilot MDA
      prod/   GBB Abuja
      dr/     GBB Lagos — async replica, RPO 5 min, RTO 4 h

State lives in the S3-compatible bucket in-country, with locking. Never local,
and never in a foreign region: the state file names every host and every secret
reference in the estate.
