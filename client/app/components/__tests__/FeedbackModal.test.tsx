import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FeedbackModal from '../FeedbackModal';

const trackEventMock = jest.fn();
jest.mock('../../lib/umami', () => ({
    trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

jest.mock('next/navigation', () => ({
    usePathname: () => '/player/CaptainTest',
}));

const fillValidForm = () => {
    fireEvent.click(screen.getByRole('radio', { name: 'Report a bug' }));
    fireEvent.change(screen.getByPlaceholderText('Describe the issue or suggestion'), {
        target: { value: 'The Activity tab chart is blank on my profile.' },
    });
};

const submitForm = async () => {
    await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!);
    });
};

describe('FeedbackModal submit tracking', () => {
    beforeEach(() => {
        trackEventMock.mockReset();
        (global.fetch as jest.Mock) = jest.fn();
    });

    it('sends the machine category value, never the display label, in the request body', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({ status: 201 });
        render(<FeedbackModal open onClose={() => undefined} />);
        fillValidForm();

        await submitForm();

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/feedback/',
                expect.objectContaining({
                    body: expect.stringContaining('"category":"bug_report"'),
                }),
            );
        });
        const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
        expect(body.category).toBe('bug_report');
        expect(body.message).toBe('The Activity tab chart is blank on my profile.');
        expect(body).toHaveProperty('locale');
        expect(body).toHaveProperty('realm');
        expect(body.path).toBe('/player/CaptainTest');
        expect(body).toHaveProperty('website', '');
        expect(typeof body.form_loaded_at).toBe('number');
    });

    it('fires feedback-submit {category, status: success} on a 201 response', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({ status: 201 });
        render(<FeedbackModal open onClose={() => undefined} />);
        fillValidForm();

        await submitForm();

        await waitFor(() => {
            expect(trackEventMock).toHaveBeenCalledWith('feedback-submit', {
                category: 'bug_report',
                status: 'success',
            });
        });
        expect(screen.getByText('Thanks! Your feedback is queued for review.')).toBeInTheDocument();
    });

    it('fires feedback-submit {category, status: invalid} on a 400 response and shows the field error', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            status: 400,
            json: async () => ({ message: ['Ensure this field has no more than 2000 characters.'] }),
        });
        render(<FeedbackModal open onClose={() => undefined} />);
        fillValidForm();

        await submitForm();

        await waitFor(() => {
            expect(trackEventMock).toHaveBeenCalledWith('feedback-submit', {
                category: 'bug_report',
                status: 'invalid',
            });
        });
        // Field-specific error under the textarea, plus the generic
        // "correct the errors below" banner — matching StreamerSubmissionModal's
        // fieldErrors + genericError split.
        expect(
            screen.getByText('Ensure this field has no more than 2000 characters.'),
        ).toBeInTheDocument();
        expect(screen.getByText('Please correct the errors below.')).toBeInTheDocument();
    });

    it('fires feedback-submit {category, status: error} when the request throws', async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));
        render(<FeedbackModal open onClose={() => undefined} />);
        fillValidForm();

        await submitForm();

        await waitFor(() => {
            expect(trackEventMock).toHaveBeenCalledWith('feedback-submit', {
                category: 'bug_report',
                status: 'error',
            });
        });
        expect(screen.getByText('Network error. Please try again.')).toBeInTheDocument();
    });

    it('falls back to the generic error message when a 400 carries no surfaced field errors', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            status: 400,
            json: async () => ({ form_loaded_at: ['too_fast'] }),
        });
        render(<FeedbackModal open onClose={() => undefined} />);
        fillValidForm();

        await submitForm();

        await waitFor(() => {
            expect(trackEventMock).toHaveBeenCalledWith('feedback-submit', {
                category: 'bug_report',
                status: 'invalid',
            });
        });
        // Neither category nor message was rejected, so there is nothing for
        // "Please correct the errors below." to point at — the generic error
        // renders instead, not an unannotated banner.
        expect(
            screen.getByText('Something went wrong. Please try again later.'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Please correct the errors below.')).not.toBeInTheDocument();
    });

    it('disables submit until a category is chosen and the message is non-blank', () => {
        render(<FeedbackModal open onClose={() => undefined} />);

        expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

        fireEvent.click(screen.getByRole('radio', { name: 'Report a bug' }));
        expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

        fireEvent.change(screen.getByPlaceholderText('Describe the issue or suggestion'), {
            target: { value: '   ' },
        });
        expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

        fireEvent.change(screen.getByPlaceholderText('Describe the issue or suggestion'), {
            target: { value: 'Real content' },
        });
        expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
    });

    it('does not submit an over-cap message — the textarea enforces the 2000-char ceiling', () => {
        render(<FeedbackModal open onClose={() => undefined} />);

        const textarea = screen.getByPlaceholderText('Describe the issue or suggestion');
        expect(textarea).toHaveAttribute('maxLength', '2000');
    });
});
