# Docker

In addition to the desktop clients it is possible to run Kanmail as a service using Docker. This will allow you to view Kanmail via a browser of your choice.

```sh
docker run -p 4420:4420 -v /path/to/data:/root/.config/kanmail/ fizzadar/kanmail:VERSION

# -p 4420:4420 to expose port 4420 inside the container
# -v /path/to/data:/root/.config/kanmail/ to persist settings + cache
```
