FROM alpine:3.22
RUN apk add --no-cache squid socat
COPY entrypoint.sh /entrypoint.sh
RUN chmod 0755 /entrypoint.sh
USER squid
ENTRYPOINT ["/entrypoint.sh"]
