client:
	python -m make

docker:
	python -m make --docker

docker-release:
	python -m make --docker --release

release:
	python -m make --release

release-complete:
	python -m make --release --complete

client-linux-docker:
	docker build \
	    -t kanmail-ubuntu-linux-build \
	    -f make/Dockerfile-ubuntu-linux-build \
	    .
	docker run \
	    -v `pwd`:/opt/kanmail \
	    kanmail-ubuntu-linux-build \
	    make

clean:
	rm -rf dist/*
	rm -f dist/.release_version_lock
	rm -f dist/.spec
	rm -f dist/.changelog
	rm -rf build/*
	rm -rf pyu-data/new/*
	git checkout -- CHANGELOG.md
