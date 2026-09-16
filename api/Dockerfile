# Civil Servant Protect — API image.
#
# Built by GitLab CI and signed; ArgoCD promotes the digest. Runs identically on
# GBB's sovereign cloud, any NITDA-registered provider, or a hyperscaler if
# policy allows — nothing here assumes a provider.

# ── build ────────────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-25 AS build

WORKDIR /build

# Dependencies resolve in their own layer, so a code change does not re-download
# the world. Roll week is the wrong time to find out the build is slow.
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn -B -q dependency:go-offline

COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q clean package -DskipTests

# Split the uber jar: the libraries change rarely and the application changes
# every commit, so they belong in different image layers.
RUN java -Djarmode=tools -jar target/csp-api-*.jar extract \
      --destination /build/app \
      --application-filename app.jar

# ── run ──────────────────────────────────────────────────────────────────────
FROM eclipse-temurin:25-jre-noble

# Never root. A process that has no reason to write anywhere should not be able
# to, which is also what makes readOnlyRootFilesystem viable in the chart.
RUN groupadd --system --gid 10001 csp \
 && useradd --system --uid 10001 --gid csp --home /app --shell /usr/sbin/nologin csp

WORKDIR /app

# Libraries first: the layer that almost never changes.
COPY --from=build --chown=10001:10001 /build/app/lib ./lib
COPY --from=build --chown=10001:10001 /build/app/app.jar ./app.jar

USER 10001:10001
EXPOSE 8080

# MaxRAMPercentage rather than a fixed heap: the pod's limit is set in the
# chart, and the JVM should follow it rather than be told the number twice.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=70 -XX:+ExitOnOutOfMemoryError"

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
