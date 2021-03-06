"use strict";
odoo.define('pos_retail.screen_sale_orders', function (require) {

    var models = require('point_of_sale.models');
    var screens = require('point_of_sale.screens');
    var core = require('web.core');
    var gui = require('point_of_sale.gui');
    var rpc = require('pos.rpc');
    var qweb = core.qweb;

    var button_booking_order = screens.ActionButtonWidget.extend({
        template: 'button_booking_order',
        button_click: function () {
            var self = this;
            var order = this.pos.get_order();
            var pricelist = order['pricelist'];
            if (!pricelist) {
                pricelist = this.pos.default_pricelist;
            }
            var length = order.orderlines.length;
            if (!order.get_client()) {
                return setTimeout(function () {
                    self.pos.gui.show_screen('clientlist');
                }, 500);
            }
            if (length == 0) {
                return this.gui.show_popup('confirm', {
                    title: 'Warning',
                    body: "Your order lines is empty",
                });
            }
            return this.gui.show_popup('popup_create_booking_order', {
                title: 'Create book order',
                pricelist: pricelist,
                order: order,
                client: order.get_client(),
            });
        }
    });

    var button_create_sale_order = screens.ActionButtonWidget.extend({
        template: 'button_create_sale_order',
        button_click: function () {
            var self = this;
            var order = this.pos.get_order();
            var length = order.orderlines.length;
            if (!order.get_client()) {
                return self.pos.gui.show_screen('clientlist');
            }
            if (length == 0) {
                return this.gui.show_popup('confirm', {
                    title: 'Warning',
                    body: "Your order lines is empty",
                });
            }
            return this.gui.show_popup('popup_create_sale_order', {
                title: 'Create sale order',
                order: order,
                client: order.get_client(),
            });
        }
    });
    screens.define_action_button({
        'name': 'button_create_sale_order',
        'widget': button_create_sale_order,
        'condition': function () {
            return this.pos.config.sale_order;
        }
    });

    var button_delivery_order = screens.ActionButtonWidget.extend({
        template: 'button_delivery_order',
        init: function (parent, options) {
            this._super(parent, options);
        },
        button_click: function () {
            this.pos.gui.show_screen('payment');
        }
    });
    screens.define_action_button({
        'name': 'button_delivery_order',
        'widget': button_delivery_order,
        'condition': function () {
            return this.pos.config.delivery_orders == true;
        }
    });

    screens.define_action_button({
        'name': 'button_booking_order',
        'widget': button_booking_order,
        'condition': function () {
            return this.pos.config.booking_orders;
        }
    });

    var button_go_sale_orders_screen = screens.ActionButtonWidget.extend({
        template: 'button_go_sale_orders_screen',
        init: function (parent, options) {
            this._super(parent, options);
        },
        button_click: function () {
            this.pos.gui.show_screen('sale_orders');
        }
    });
    screens.define_action_button({
        'name': 'button_go_sale_orders_screen',
        'widget': button_go_sale_orders_screen,
        'condition': function () {
            return this.pos.config.delivery_orders == true;
        }
    });

    /*
        This screen management 2 function:
        1) sale orders screen
        2) booked orders
    */
    var sale_orders = screens.ScreenWidget.extend({
        template: 'sale_orders',

        init: function (parent, options) {
            var self = this;
            this.sale_selected = null;
            this.reverse = true;
            this._super(parent, options);
            this.sale_orders_cache = new screens.DomCache();
            this.pos.bind('sync:sale_orders', function () {
                self.hide_order_selected()
                self.show()
            }, this);
        },
        renderElement: function () {
             var self = this;
             this._super();
             this.$('.back').click(function () {
                 self.gui.show_screen('products');
             });
         },
        show: function (options) {
            this.search_orders = [];
            var sale_selected = this.pos.sale_selected;
            this._super(options);
            var self = this;
            this.auto_complete_search();
            var search_timeout = null;
            this.render_sale_orders(this.pos.db.sale_orders);
            this.$('.client-list-contents').delegate('.sale_row', 'click', function (event) {
                self.order_select(event, $(this), parseInt($(this).data('id')));
            });
            var search_timeout = null;

            if (this.pos.config.iface_vkeyboard && this.chrome.widget.keyboard) {
                this.chrome.widget.keyboard.connect(this.$('.searchbox input'));
            }

            this.$('.searchbox input').on('keypress', function (event) {
                clearTimeout(search_timeout);
                var searchbox = this;
                search_timeout = setTimeout(function () {
                    self.perform_search(searchbox.value, event.which === 13);
                }, 70);
                var contents = self.$('.sale_order_detail');
                contents.empty();
            });
            this.$('.booked_order_button').click(function () {
                var sale_orders = _.filter(self.pos.db.sale_orders, function (order) {
                    return order['book_order'] == true && (order['state'] == 'draft' || order['state'] == 'sent');
                });
                var contents = self.$('.sale_order_detail');
                contents.empty();
                self.render_sale_orders(sale_orders);

            });
            this.$('.sale_lock_button').click(function () {
                var sale_orders = _.filter(self.pos.db.sale_orders, function (order) {
                    return order['state'] == 'sale' || order['state'] == 'done';
                });
                var contents = self.$('.sale_order_detail');
                contents.empty();
                self.render_sale_orders(sale_orders);
            });
            this.$('.searchbox .search-clear').click(function () {
                var contents = self.$('.sale_order_detail');
                contents.empty();
                self.clear_search();
            });
            if (sale_selected) {
                var sale = self.pos.db.sale_order_by_id[sale_selected['id']];
                self.display_sale_order(sale);
            }
            this.$('.sort_by_sale_order_id').click(function () {
                if (self.search_orders.length == 0) {
                    self.pos.db.sale_orders = self.pos.db.sale_orders.sort(self.pos.sort_by('id', self.reverse, parseInt));
                    self.render_sale_orders(self.pos.db.sale_orders);
                    self.reverse = !self.reverse;
                } else {
                    self.search_orders = self.search_orders.sort(self.pos.sort_by('id', self.reverse, parseInt));
                    self.render_sale_orders(self.search_orders);
                    self.reverse = !self.reverse;
                }
            });
            this.$('.sort_by_sale_order_name').click(function () {
                if (self.search_orders.length == 0) {
                    self.pos.db.sale_orders = self.pos.db.sale_orders.sort(self.pos.sort_by('name', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase()
                    }));
                    self.render_sale_orders(self.pos.db.sale_orders);
                    self.reverse = !self.reverse;
                } else {
                    self.search_orders = self.search_orders.sort(self.pos.sort_by('name', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase()
                    }));
                    self.render_sale_orders(self.search_orders);
                    self.reverse = !self.reverse;
                }

            });
            this.$('.sort_by_sale_order_origin').click(function () {
                if (self.search_orders.length == 0) {
                    self.pos.db.sale_orders = self.pos.db.sale_orders.sort(self.pos.sort_by('origin', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase()
                    }));
                    self.render_sale_orders(self.pos.db.sale_orders);
                    self.reverse = !self.reverse;
                } else {
                    self.search_orders = self.search_orders.sort(self.pos.sort_by('origin', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase()
                    }));
                    self.render_sale_orders(self.search_orders);
                    self.reverse = !self.reverse;
                }

            });
            this.$('.sort_by_sale_order_partner_name').click(function () {
                if (self.search_orders.length == 0) {
                    self.pos.db.sale_orders = self.pos.db.sale_orders.sort(self.pos.sort_by('partner_name', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase()
                    }));
                    self.render_sale_orders(self.pos.db.sale_orders);
                    self.reverse = !self.reverse;
                } else {
                    self.search_orders = self.search_orders.sort(self.pos.sort_by('partner_name', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase()
                    }));
                    self.render_sale_orders(self.search_orders);
                    self.reverse = !self.reverse;
                }
            });
            this.$('.sort_by_sale_order_date_order').click(function () {
                if (self.search_orders.length == 0) {
                    self.pos.db.sale_orders = self.pos.db.sale_orders.sort(self.pos.sort_by('date_order', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase()
                    }));
                    self.render_sale_orders(self.pos.db.sale_orders);
                    self.reverse = !self.reverse;
                } else {
                    self.search_orders = self.search_orders.sort(self.pos.sort_by('date_order', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase()
                    }));
                    self.render_sale_orders(self.search_orders);
                    self.reverse = !self.reverse;
                }

            });
            this.$('.sort_by_sale_order_payment_partial_amount').click(function () {
                if (self.search_orders.length == 0) {
                    self.pos.db.sale_orders = self.pos.db.sale_orders.sort(self.pos.sort_by('payment_partial_amount', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase();
                    }));
                    self.render_sale_orders(self.pos.db.sale_orders);
                    self.reverse = !self.reverse;
                } else {
                    self.search_orders = self.search_orders.sort(self.pos.sort_by('payment_partial_amount', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase();
                    }));
                    self.render_sale_orders(self.search_orders);
                    self.reverse = !self.reverse;
                }
            });
            this.$('.sort_by_sale_order_amount_tax').click(function () {
                if (self.search_orders.length == 0) {
                    self.pos.db.sale_orders = self.pos.db.sale_orders.sort(self.pos.sort_by('amount_tax', self.reverse, parseInt));
                    self.render_sale_orders(self.pos.db.sale_orders);
                    self.reverse = !self.reverse;
                } else {
                    self.search_orders = self.search_orders.sort(self.pos.sort_by('amount_tax', self.reverse, parseInt));
                    self.render_sale_orders(self.search_orders);
                    self.reverse = !self.reverse;
                }
            });
            this.$('.sort_by_sale_order_amount_total').click(function () {
                if (self.search_orders.length == 0) {
                    self.pos.db.sale_orders = self.pos.db.sale_orders.sort(self.pos.sort_by('amount_total', self.reverse, parseInt));
                    self.render_sale_orders(self.pos.db.sale_orders);
                    self.reverse = !self.reverse;
                } else {
                    self.search_orders = self.search_orders.sort(self.pos.sort_by('amount_total', self.reverse, parseInt));
                    self.render_sale_orders(self.search_orders);
                    self.reverse = !self.reverse;
                }
            });
            this.$('.sort_by_sale_order_state').click(function () {
                if (self.search_orders.length == 0) {
                    self.pos.db.sale_orders = self.pos.db.sale_orders.sort(self.pos.sort_by('state', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase();
                    }));
                    self.render_sale_orders(self.pos.db.sale_orders);
                    self.reverse = !self.reverse;
                } else {
                    self.search_orders = self.search_orders.sort(self.pos.sort_by('state', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase();
                    }));
                    self.render_sale_orders(self.search_orders);
                    self.reverse = !self.reverse;
                }
            });
        },
        clear_search: function () {
            var contents = this.$('.sale_order_detail');
            contents.empty();
            this.render_sale_orders(this.pos.db.sale_orders);
            this.$('.searchbox input')[0].value = '';
            this.$('.searchbox input').focus();
            this.search_orders = [];
        },
        perform_search: function (query, associate_result) {
            var orders;
            if (query) {
                orders = this.pos.db.search_sale_orders(query);
                if (associate_result && orders.length === 1) {
                    return this.display_sale_order(orders[0]);
                }
                this.search_orders = orders;
                return this.render_sale_orders(orders);
            } else {
                sale_orders = this.pos.db.sale_orders;
                return this.render_sale_orders(sale_orders);
            }
        },
        auto_complete_search: function () {
            var self = this;
            var $search_box = $('.search-pos-order >input');
            if ($search_box) {
                $search_box.autocomplete({
                    source: this.pos.db.sale_orders_autocomplete,
                    minLength: this.pos.config.min_length_search,
                    select: function (event, ui) {
                        if (ui && ui['item'] && ui['item']['value']) {
                            var order = self.pos.db.sale_order_by_id[ui['item']['value']];
                            self.display_sale_order(order);
                            setTimeout(function () {
                                self.clear_search();
                            }, 1000);
                        }
                    }
                });
            }
        },
        partner_icon_url: function (id) {
            return '/web/image?model=res.partner&id=' + id + '&field=image_small';
        },
        order_select: function (event, $order, id) {
            var order = this.pos.db.sale_order_by_id[id];
            this.$('.client-line').removeClass('highlight');
            $order.addClass('highlight');
            this.display_sale_order(order);
        },
        render_sale_orders: function (sales) {
            var contents = this.$el[0].querySelector('.sale_orders_table');
            contents.innerHTML = "";
            for (var i = 0, len = Math.min(sales.length, 1000); i < len; i++) {
                var sale = sales[i];
                var sale_row = this.sale_orders_cache.get_node(sale.id);
                if (!sale_row) {
                    var sale_row_html = qweb.render('sale_row', {widget: this, sale: sale});
                    var sale_row = document.createElement('tbody');
                    sale_row.innerHTML = sale_row_html;
                    sale_row = sale_row.childNodes[1];
                    this.sale_orders_cache.cache_node(sale.id, sale_row);
                }
                if (sale === this.sale_selected) {
                    sale_row.classList.add('highlight');
                } else {
                    sale_row.classList.remove('highlight');
                }
                contents.appendChild(sale_row);
            }
        },
        display_sale_order: function (sale) {
            this.sale_selected = sale;
            var self = this;
            var contents = this.$('.sale_order_detail');
            contents.empty();
            if (!sale) {
                return;
            }
            sale['link'] = window.location.origin + "/web#id=" + sale.id + "&view_type=form&model=sale.order";
            contents.append($(qweb.render('sale_order_detail', {widget: this, sale: sale})));
            var sale_lines = this.pos.db.sale_lines_by_sale_id[sale.id];
            if (sale_lines) {
                var line_contents = this.$('.lines_detail');
                line_contents.empty();
                line_contents.append($(qweb.render('sale_order_lines', {widget: this, lines: sale_lines})));
            }
            this.$('.print_quotation').click(function () {
                self.chrome.do_action('sale.action_report_saleorder', {
                    additional_context: {
                        active_ids: [self.sale_selected['id']]
                    }
                })
            });
            this.$('.action_report_pro_forma_invoice').click(function () {
                self.chrome.do_action('sale.action_report_saleorder', {
                    additional_context: {
                        active_ids: [self.sale_selected['id']]
                    }
                })
            });
            this.$('.action_confirm').click(function () {
                self.pos.gui.close_popup();
                return rpc.query({
                    model: 'sale.order',
                    method: 'action_confirm',
                    args:
                        [[self.sale_selected['id']]],
                    context: {
                        pos: true
                    }
                }).then(function () {
                    self.link = window.location.origin + "/web#id=" + self.sale_selected.id + "&view_type=form&model=sale.order";
                    return self.gui.show_popup('confirm', {
                        title: 'Done',
                        body: self.sale_selected['name'] + ' confirmed',
                        confirm: function () {
                            window.open(self.link, '_blank');
                        },
                        cancel: function () {
                            self.pos.gui.close_popup();
                        }
                    })
                }).fail(function (type, error) {
                    return self.pos.query_backend_fail(type, error);
                })
            });
            this.$('.action_done').click(function () {
                return rpc.query({
                    model: 'sale.order',
                    method: 'action_done',
                    args:
                        [[self.sale_selected['id']]],
                    context: {
                        pos: true
                    }
                }).then(function () {
                    self.link = window.location.origin + "/web#id=" + self.sale_selected.id + "&view_type=form&model=sale.order";
                    return self.gui.show_popup('confirm', {
                        title: 'Done',
                        body: 'Sale order processed to done, are you want open revieew ?',
                        confirmButtonText: 'Yes',
                        cancelButtonText: 'Close',
                        confirm: function () {
                            return window.open(self.link, '_blank');
                        },
                    })
                }).fail(function (type, error) {
                    return self.pos.query_backend_fail(type, error);
                })
            });
            this.$('.action_return').click(function () {
                if (self.sale_selected) {
                    self.pos.gui.show_popup('popup_stock_return_picking', {
                        sale: self.sale_selected,
                        title: 'Return sale order',
                        confirm: function () {
                            self.render_sale_orders(self.pos.db.sale_orders);
                        }
                    })
                }

            });
            this.$('.action_validate_picking').click(function () {
                if (self.sale_selected) {
                    return rpc.query({
                        model: 'sale.order',
                        method: 'action_validate_picking',
                        args:
                            [[self.sale_selected['id']]],
                        context: {
                            pos: true
                        }
                    }).then(function (picking_name) {
                        if (picking_name) {
                            self.link = window.location.origin + "/web#id=" + self.sale_selected.id + "&view_type=form&model=sale.order";
                            return self.pos.gui.show_popup('confirm', {
                                title: 'Done',
                                body: 'Order create delivery Finished, are you want open picking order now ?',
                                confirm: function () {
                                    window.open(self.link, '_blank');
                                },
                                cancel: function () {
                                    self.pos.gui.close_popup();
                                }
                            })
                        } else {
                            self.link = window.location.origin + "/web#id=" + self.sale_selected.id + "&view_type=form&model=sale.order";
                            return self.pos.gui.show_popup('confirm', {
                                title: 'Warning',
                                body: 'Order have 2 picking, please do manual',
                                confirm: function () {
                                    window.open(self.link, '_blank');
                                },
                                cancel: function () {
                                    self.pos.gui.close_popup();
                                }
                            })
                        }
                        return self.pos.gui.close_popup();
                    }).fail(function (type, error) {
                        return self.pos.query_backend_fail(type, error);
                    })
                }
            })
            this.$('.delivery_order').click(function () {
                if (self.sale_selected) {
                    var lines = self.pos.db.sale_lines_by_sale_id[self.sale_selected['id']];
                    var sale_selected = self.sale_selected;
                    if (!lines) {
                        return self.pos.gui.show_popup('confirm', {
                            title: 'Warning',
                            body: 'Sale order is blank lines, could not cover to pos order',
                        })
                    }
                    var order = new models.Order({}, {pos: self.pos, temporary: true});
                    order['name'] = self.sale_selected['name'];
                    order['sale_id'] = sale_selected['id'];
                    order['delivery_address'] = sale_selected['delivery_address'];
                    order['delivery_date'] = sale_selected['delivery_date'];
                    order['delivery_phone'] = sale_selected['delivery_phone'];
                    var partner_id = sale_selected['partner_id'];
                    var partner = self.pos.db.get_partner_by_id(partner_id[0]);
                    if (partner) {
                        order.set_client(partner);
                    } else {
                        return self.pos.gui.show_popup('confirm', {
                            title: 'Warning',
                            body: 'Partner ' + partner_id[1] + ' not available on pos, please update this partner active on POS',
                        })
                    }
                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i];
                        var product = self.pos.db.get_product_by_id(line.product_id[0])
                        if (!product) {
                            return self.pos.gui.show_popup('confirm', {
                                title: 'Warning',
                                body: 'Product ' + line.product_id[1] + ' not available on pos, please checking to field available on pos for this product',
                            })
                        } else {
                            var new_line = new models.Orderline({}, {pos: self.pos, order: order, product: product});
                            new_line.set_unit_price(line.price_unit)
                            new_line.set_quantity(line.product_uom_qty, 'keep price');
                            order.orderlines.add(new_line);
                        }
                    }
                    if (self.sale_selected['payment_partial_amount'] && self.sale_selected['payment_partial_journal_id']) {
                        var payment_partial_journal_id = self.sale_selected['payment_partial_journal_id'][0];
                        var payment_partial_register = _.find(self.pos.cashregisters, function (cashregister) {
                            return cashregister.journal['id'] == payment_partial_journal_id;
                        });
                        if (payment_partial_register) {
                            var partial_paymentline = new models.Paymentline({}, {
                                order: order,
                                cashregister: payment_partial_register,
                                pos: self.pos
                            });
                            partial_paymentline.set_amount(self.sale_selected['payment_partial_amount']);
                            order.paymentlines.add(partial_paymentline);
                            order['amount_debit'] = order.get_total_with_tax() - self.sale_selected['payment_partial_amount']
                        } else {
                            return self.pos.gui.show_popup('confirm', {
                                title: 'Warning',
                                body: 'POS have not journal ' + self.sale_selected['payment_partial_journal_id'][1],
                            })
                        }
                    }
                    var orders = self.pos.get('orders');
                    orders.add(order);
                    self.pos.set('selectedOrder', order);
                    self.pos.gui.show_screen('receipt');
                }
            })
        },
        hide_order_selected: function () {
            var contents = this.$('.sale_order_detail');
            contents.empty();
            this.sale_selected = null;

        },
    });
    gui.define_screen({name: 'sale_orders', widget: sale_orders});

    screens.OrderWidget.include({
        update_count_booked_orders: function () { // set count booked orders
            var $booked_orders = $('.booked_orders');
            if ($booked_orders) {
                var sale_orders = _.filter(this.pos.db.sale_orders, function (order) {
                    return order['book_order'] == true && (order['state'] == 'draft' || order['state'] == 'sent');
                });
                $booked_orders.text(sale_orders.length);
            }
        },
        active_button_create_sale_order: function (buttons, selected_order) {
            if (buttons && buttons.button_create_sale_order) {
                if (selected_order && selected_order.get_client() && selected_order.orderlines.length > 0) {
                    buttons.button_create_sale_order.highlight(true);
                } else {
                    buttons.button_create_sale_order.highlight(false);
                }
            }
        },
        active_button_booking_order: function (buttons, selected_order) {
            if (buttons.button_booking_order && selected_order.get_client()) {
                buttons.button_booking_order.highlight(true);
            }
            if (buttons.button_booking_order && !selected_order.get_client()) {
                buttons.button_booking_order.highlight(false);
            }
        },
        active_button_delivery_order: function (buttons, selected_order) {
            if (buttons.button_delivery_order && selected_order.delivery_address) {
                buttons.button_delivery_order.highlight(true);
            }
            if (buttons.button_delivery_order && !selected_order.delivery_address) {
                buttons.button_delivery_order.highlight(false);
            }
        },
        show_delivery_address: function (buttons, selected_order) {
            var $delivery_address = this.el.querySelector('.delivery_address');
            var $delivery_date = this.el.querySelector('.delivery_date');
            if ($delivery_address) {
                $delivery_address.textContent = selected_order['delivery_address'];
            }
            if ($delivery_date) {
                $delivery_date.textContent = selected_order['delivery_date'];
            }
        },
        update_summary: function () {
            this._super();
            this.update_count_booked_orders();
            var buttons = this.getParent().action_buttons;
            var order = this.pos.get_order();
            if (order && buttons) {
                this.active_button_create_sale_order(buttons, order);
                this.active_button_booking_order(buttons, order);
                this.active_button_delivery_order(buttons, order);
                this.show_delivery_address(buttons, order);
            }
        }
    })
});
