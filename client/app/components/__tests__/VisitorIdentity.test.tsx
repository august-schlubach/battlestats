import React from 'react';
import { render } from '@testing-library/react';
import VisitorIdentity from '../VisitorIdentity';
import { VISITOR_ID_STORAGE_KEY, resetVisitorIdCache } from '../../lib/visitorId';

describe('VisitorIdentity', () => {
    const originalUmami = window.umami;

    beforeEach(() => {
        jest.useFakeTimers();
        window.localStorage.clear();
        resetVisitorIdCache();
    });

    afterEach(() => {
        jest.useRealTimers();
        window.umami = originalUmami;
    });

    it('identifies the visitor immediately when the tracker is already loaded', () => {
        const identify = jest.fn();
        window.umami = { track: jest.fn(), identify };

        render(<VisitorIdentity />);

        expect(identify).toHaveBeenCalledTimes(1);
        expect(identify).toHaveBeenCalledWith(window.localStorage.getItem(VISITOR_ID_STORAGE_KEY));
    });

    it('waits for the deferred tracker script, then identifies once', () => {
        window.umami = undefined;

        render(<VisitorIdentity />);

        jest.advanceTimersByTime(600);

        const identify = jest.fn();
        window.umami = { track: jest.fn(), identify };
        jest.advanceTimersByTime(200);

        expect(identify).toHaveBeenCalledTimes(1);

        // The poll stops on success rather than re-identifying every tick.
        jest.advanceTimersByTime(2000);
        expect(identify).toHaveBeenCalledTimes(1);
    });

    it('gives up after a bounded number of attempts when the tracker never arrives', () => {
        window.umami = undefined;
        const clearInterval = jest.spyOn(window, 'clearInterval');

        render(<VisitorIdentity />);
        jest.advanceTimersByTime(200 * 25);

        expect(clearInterval).toHaveBeenCalled();

        // Nothing is pending, so a late-arriving tracker is not called.
        const identify = jest.fn();
        window.umami = { track: jest.fn(), identify };
        jest.advanceTimersByTime(5000);
        expect(identify).not.toHaveBeenCalled();

        clearInterval.mockRestore();
    });

    it('does not identify when no durable id can be stored', () => {
        const identify = jest.fn();
        window.umami = { track: jest.fn(), identify };
        const setItem = jest
            .spyOn(window.localStorage.__proto__ as Storage, 'setItem')
            .mockImplementation(() => {
                throw new Error('storage disabled');
            });

        render(<VisitorIdentity />);

        expect(identify).not.toHaveBeenCalled();
        setItem.mockRestore();
    });

    it('renders nothing', () => {
        window.umami = { track: jest.fn(), identify: jest.fn() };
        const { container } = render(<VisitorIdentity />);
        expect(container).toBeEmptyDOMElement();
    });
});
