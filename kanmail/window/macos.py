import AppKit


def show_traffic_light_buttons(window):
    buttons = [
        window.standardWindowButton_(AppKit.NSWindowCloseButton),
        window.standardWindowButton_(AppKit.NSWindowZoomButton),
        window.standardWindowButton_(AppKit.NSWindowMiniaturizeButton),
    ]

    for button in buttons:
        button.setHidden_(False)


def reposition_traffic_light_buttons(window):
    button = window.standardWindowButton_(AppKit.NSWindowCloseButton)
    titlebar_container_view = button.superview().superview()
    titlebar_container_rect = titlebar_container_view.frame()
    titlebar_container_rect.size.height += 22
    titlebar_container_rect.origin.y -= 13
    titlebar_container_rect.size.width += 22
    titlebar_container_rect.origin.x += 13
    titlebar_container_view._.frame = AppKit.NSValue.valueWithRect_(titlebar_container_rect)
