{{/* Image reference. Digest wins over tag: CI signs a digest and ArgoCD
     promotes that exact one, whereas a tag can be moved under you. */}}
{{- define "csp.image" -}}
{{- $root := index . 0 -}}
{{- $component := index . 1 -}}
{{- $registry := $root.Values.global.imageRegistry -}}
{{- if $component.image.digest -}}
{{ $registry }}/{{ $component.image.repository }}@{{ $component.image.digest }}
{{- else if $component.image.tag -}}
{{ $registry }}/{{ $component.image.repository }}:{{ $component.image.tag }}
{{- else -}}
{{ fail "set either image.digest (preferred) or image.tag" }}
{{- end -}}
{{- end -}}

{{- define "csp.labels" -}}
app.kubernetes.io/name: csp
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- if .Values.global.revision }}
csp.ng/revision: {{ .Values.global.revision | quote }}
{{- end }}
{{- end -}}

{{/* Pod hardening applied to everything. No exceptions, so a new workload
     inherits it rather than being reviewed for it. */}}
{{- define "csp.podSecurity" -}}
runAsNonRoot: true
runAsUser: {{ .Values.podSecurity.runAsUser }}
runAsGroup: {{ .Values.podSecurity.runAsGroup }}
fsGroup: {{ .Values.podSecurity.fsGroup }}
seccompProfile:
  type: RuntimeDefault
{{- end -}}

{{- define "csp.containerSecurity" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: ["ALL"]
{{- end -}}

{{/* The database URL, assembled once. Credentials come from a secret; only the
     host and database name live in values. */}}
{{- define "csp.databaseUrl" -}}
jdbc:postgresql://{{ required "postgres.host is required" .Values.postgres.host }}:{{ .Values.postgres.port }}/{{ .Values.postgres.database }}
{{- end -}}
